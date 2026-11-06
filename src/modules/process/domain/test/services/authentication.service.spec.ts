import * as bcrypt from 'bcrypt';
import { AuthenticationService } from '@process/domain/services/authentication.service';
import { AuthenticationModel } from '@process/domain/models/authentication.model';
import { AuthenticationStatus } from '@process/domain/models/authentication-result.model';

// _getSerial() lit un fichier reel du boitier (/home/clv/udi/unique_device_id) : seul
// readFileSync est mocke pour ne jamais dependre de ce fichier physique pendant les tests ;
// le reste de fs doit rester reel car bcrypt en depend (existsSync) pour charger son binding natif.
jest.mock('fs', () => ({ ...(jest.requireActual('fs') as object), readFileSync: jest.fn() }));
import * as fs from 'fs';

function CreateLoggerMock(): { log: jest.Mock; debug: jest.Mock; warn: jest.Mock; error: jest.Mock } {
    return { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe('AuthenticationService (fs mocked)', () => {
    let authenticationRepository: {
        get: jest.Mock; update: jest.Mock; findByLogin: jest.Mock; updatePasswordByLogin: jest.Mock;
        incrementFailedAttempts: jest.Mock; setLockedUntil: jest.Mock; resetFailedAttempts: jest.Mock;
    };
    let recoveryCodeRepository: { getByLogin: jest.Mock; upsert: jest.Mock; deleteByLogin: jest.Mock; incrementAttempts: jest.Mock };
    let globalSettingsService: { language: string; timeZone: string };
    let mailService: { send: jest.Mock };
    let config: { get: jest.Mock };
    let logger: ReturnType<typeof CreateLoggerMock>;
    let service: AuthenticationService;

    beforeEach(() => {
        jest.clearAllMocks();
        (fs.readFileSync as jest.Mock).mockReturnValue('device-serial-42');
        authenticationRepository = {
            get: jest.fn(), update: jest.fn(), findByLogin: jest.fn(), updatePasswordByLogin: jest.fn(),
            incrementFailedAttempts: jest.fn(), setLockedUntil: jest.fn(), resetFailedAttempts: jest.fn()
        };
        recoveryCodeRepository = { getByLogin: jest.fn(), upsert: jest.fn(), deleteByLogin: jest.fn(), incrementAttempts: jest.fn() };
        globalSettingsService = { language: 'fr', timeZone: 'UTC' };
        mailService = { send: jest.fn() };
        config = { get: jest.fn().mockReturnValue('super-secret-initial-password') };
        logger = CreateLoggerMock();

        service = new AuthenticationService(authenticationRepository as never, recoveryCodeRepository as never, mailService as never, globalSettingsService as never, config as never, logger as never);
    });

    describe('_getSerial', () => {
        it('should read the device unique id file as utf8', () => {
            const serial = service._getSerial();

            expect(serial).toEqual('device-serial-42');
            expect(fs.readFileSync).toHaveBeenCalledWith('/home/clv/udi/unique_device_id', 'utf8');
        });
    });

    describe('initAuthentication', () => {
        it('should generate and persist credentials when none exist yet', async () => {
            authenticationRepository.get.mockResolvedValue({ login: undefined, password: undefined });
            authenticationRepository.update.mockResolvedValue({ id: 'device-serial-42', login: 'device-serial-42', password: 'hashed' });

            const isInitialized = await service.initAuthentication();

            expect(isInitialized).toBe(true);
            expect(logger.log).toHaveBeenCalledWith('no credentials found, initializing authentication');
            expect(authenticationRepository.update).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'device-serial-42', login: 'device-serial-42' })
            );
            const savedModel = authenticationRepository.update.mock.calls[0][0] as AuthenticationModel;
            expect(bcrypt.compareSync('super-secret-initial-password', savedModel.password)).toBe(true);
        });

        it('should return false when persisting the freshly generated credentials fails', async () => {
            authenticationRepository.get.mockResolvedValue({});
            authenticationRepository.update.mockResolvedValue(null);

            await expect(service.initAuthentication()).resolves.toBe(false);
        });

        it('should not regenerate credentials when a login already exists', async () => {
            authenticationRepository.get.mockResolvedValue({ login: 'existing-login', password: undefined });

            const isInitialized = await service.initAuthentication();

            expect(isInitialized).toBe(true);
            expect(logger.log).toHaveBeenCalledWith('authentication already initialized');
            expect(authenticationRepository.update).not.toHaveBeenCalled();
        });

        it('should not regenerate credentials when a password already exists', async () => {
            authenticationRepository.get.mockResolvedValue({ login: undefined, password: 'existing-hash' });

            const isInitialized = await service.initAuthentication();

            expect(isInitialized).toBe(true);
            expect(authenticationRepository.update).not.toHaveBeenCalled();
        });
    });

    describe('checkPassword', () => {
        const hash = bcrypt.hashSync('correct-password', bcrypt.genSaltSync(4));

        it('should return SUCCESS and log nothing for a matching password', async () => {
            authenticationRepository.get.mockResolvedValue({ id: 'x', login: 'user', password: hash, failedAttempts: 0, lockedUntil: null });

            const result = await service.manageAuthentication({ id: 'x', login: 'user', password: 'correct-password' });

            expect(result.status).toBe(AuthenticationStatus.SUCCESS);
            expect(result.success).toBe(true);
            expect(result.message).toBe('Connexion réussie');
            expect(logger.warn).not.toHaveBeenCalled();
            expect(authenticationRepository.resetFailedAttempts).not.toHaveBeenCalled();
        });

        it('should reset the failure counter after a successful login', async () => {
            authenticationRepository.get.mockResolvedValue({ id: 'x', login: 'user', password: hash, failedAttempts: 3, lockedUntil: null });

            const result = await service.manageAuthentication({ id: 'x', login: 'user', password: 'correct-password' });

            expect(result.status).toBe(AuthenticationStatus.SUCCESS);
            expect(authenticationRepository.resetFailedAttempts).toHaveBeenCalledWith('x');
        });

        it('should return INVALID_CREDENTIALS with remaining attempts before the lockout threshold', async () => {
            authenticationRepository.get.mockResolvedValue({ id: 'x', login: 'user', password: hash, failedAttempts: 1 });
            authenticationRepository.incrementFailedAttempts.mockResolvedValue(2);

            const result = await service.manageAuthentication({ id: 'x', login: 'user', password: 'wrong-password' });

            expect(result).toEqual(expect.objectContaining({ success: false, status: AuthenticationStatus.INVALID_CREDENTIALS, failedAttempts: 2, attemptsRemaining: 3 }));
            expect(authenticationRepository.setLockedUntil).not.toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalledWith({ login: 'user', failedAttempts: 2 }, 'authentication failed');
        });

        it.each([
            [5, 1 * 60 * 1000],
            [6, 5 * 60 * 1000],
            [7, 15 * 60 * 1000],
            [8, 30 * 60 * 1000],
            [9, 60 * 60 * 1000],
            [15, 60 * 60 * 1000]
        ])('should lock the account after %i failures for %i ms', async (failures, delay) => {
            const now = Date.now();
            jest.spyOn(Date, 'now').mockReturnValue(now);
            authenticationRepository.get.mockResolvedValue({ id: 'x', login: 'user', password: hash });
            authenticationRepository.incrementFailedAttempts.mockResolvedValue(failures);

            const result = await service.manageAuthentication({ id: 'x', login: 'user', password: 'wrong-password' });

            expect(result.status).toBe(AuthenticationStatus.ACCOUNT_LOCKED);
            expect(result.failedAttempts).toBe(failures);
            expect(result.lockedUntil).toEqual(new Date(now + delay));
            expect(authenticationRepository.setLockedUntil).toHaveBeenCalledWith('x', new Date(now + delay));
            jest.restoreAllMocks();
        });

        it('should refuse a correct password while locked, without counting a new failure', async () => {
            const lockedUntil = new Date('2026-11-05T10:30:00Z');
            jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-11-05T10:00:00Z').getTime());
            authenticationRepository.get.mockResolvedValue({ id: 'x', login: 'user', password: hash, failedAttempts: 8, lockedUntil });

            const result = await service.manageAuthentication({ id: 'x', login: 'user', password: 'correct-password' });

            expect(result).toEqual(expect.objectContaining({ status: AuthenticationStatus.ACCOUNT_LOCKED, failedAttempts: 8, lockedUntil }));
            expect(result.message).toBe('Compte bloqué après 8 tentatives échouées. Réessayez à 10:30');
            expect(authenticationRepository.incrementFailedAttempts).not.toHaveBeenCalled();
            jest.restoreAllMocks();
        });

        it('should translate the message in the global settings language and time zone', async () => {
            globalSettingsService.language = 'en';
            globalSettingsService.timeZone = 'Africa/Casablanca';
            const lockedUntil = new Date('2026-11-05T10:30:00Z');
            jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-11-05T10:00:00Z').getTime());
            authenticationRepository.get.mockResolvedValue({ id: 'x', login: 'user', password: hash, failedAttempts: 5, lockedUntil });

            const result = await service.manageAuthentication({ id: 'x', login: 'user', password: 'wrong-password' });

            expect(result.message).toBe('Account locked after 5 failed attempts. Try again at 11:30');
            jest.restoreAllMocks();
        });

        it('should return MISSING_PASSWORD when no password is provided', async () => {
            const result = await service.manageAuthentication({ id: 'x', login: 'user', password: '' });

            expect(result.status).toBe(AuthenticationStatus.MISSING_PASSWORD);
            expect(authenticationRepository.get).not.toHaveBeenCalled();
        });

        it('should return NOT_INITIALIZED when no credentials are stored', async () => {
            authenticationRepository.get.mockResolvedValue({});

            const result = await service.manageAuthentication({ id: 'x', login: 'user', password: 'any' });

            expect(result.status).toBe(AuthenticationStatus.NOT_INITIALIZED);
        });
    });

    describe('recovery', () => {
        const codeHash = bcrypt.hashSync('ABC234', bcrypt.genSaltSync(4));
        const future = (): Date => new Date(Date.now() + 60_000);

        it('should send a recovery code when the login has an email', async () => {
            authenticationRepository.findByLogin.mockResolvedValue({ login: 'user', email: 'user@example.com' });

            const result = await service.manageAuthentication({ id: 'x', login: 'user', password: '', isRecovery: true });

            expect(result.status).toBe(AuthenticationStatus.RECOVERY_CODE_SENT);
            expect(result.success).toBe(true);
            expect(result.codeExpiresAt).toBeInstanceOf(Date);
            expect(recoveryCodeRepository.upsert).toHaveBeenCalled();
        });

        it('should return RECOVERY_UNAVAILABLE for an unknown login', async () => {
            authenticationRepository.findByLogin.mockResolvedValue(null);

            const result = await service.manageAuthentication({ id: 'x', login: 'ghost', password: '', isRecovery: true });

            expect(result.status).toBe(AuthenticationStatus.RECOVERY_UNAVAILABLE);
        });

        it('should validate a code without consuming it', async () => {
            recoveryCodeRepository.getByLogin.mockResolvedValue({ login: 'user', code: codeHash, expiresAt: future(), attempts: 0 });

            const result = await service.manageAuthentication({ id: 'x', login: 'user', password: '', isRecovery: true, code: 'abc234' });

            expect(result.status).toBe(AuthenticationStatus.RECOVERY_CODE_VALID);
            expect(recoveryCodeRepository.deleteByLogin).not.toHaveBeenCalled();
        });

        it('should return RECOVERY_CODE_EXPIRED when the code is expired', async () => {
            recoveryCodeRepository.getByLogin.mockResolvedValue({ login: 'user', code: codeHash, expiresAt: new Date(Date.now() - 1000), attempts: 0 });

            const result = await service.manageAuthentication({ id: 'x', login: 'user', password: '', isRecovery: true, code: 'ABC234' });

            expect(result.status).toBe(AuthenticationStatus.RECOVERY_CODE_EXPIRED);
        });

        it('should return RECOVERY_CODE_INVALID with remaining attempts', async () => {
            recoveryCodeRepository.getByLogin.mockResolvedValue({ login: 'user', code: codeHash, expiresAt: future(), attempts: 1 });
            recoveryCodeRepository.incrementAttempts.mockResolvedValue(2);

            const result = await service.manageAuthentication({ id: 'x', login: 'user', password: '', isRecovery: true, code: 'WRONG1' });

            expect(result).toEqual(expect.objectContaining({ status: AuthenticationStatus.RECOVERY_CODE_INVALID, attemptsRemaining: 3 }));
        });

        it('should invalidate the code after too many invalid attempts', async () => {
            recoveryCodeRepository.getByLogin.mockResolvedValue({ login: 'user', code: codeHash, expiresAt: future(), attempts: 4 });
            recoveryCodeRepository.incrementAttempts.mockResolvedValue(5);

            const result = await service.manageAuthentication({ id: 'x', login: 'user', password: '', isRecovery: true, code: 'WRONG1' });

            expect(result.status).toBe(AuthenticationStatus.RECOVERY_CODE_TOO_MANY_ATTEMPTS);
            expect(recoveryCodeRepository.deleteByLogin).toHaveBeenCalledWith('user');
        });

        it('should refuse a password reset with an invalid code', async () => {
            recoveryCodeRepository.getByLogin.mockResolvedValue({ login: 'user', code: codeHash, expiresAt: future(), attempts: 0 });
            recoveryCodeRepository.incrementAttempts.mockResolvedValue(1);

            const result = await service.manageAuthentication({ id: 'x', login: 'user', password: '', isRecovery: true, code: 'WRONG1', newPassword: 'new-pass' });

            expect(result.status).toBe(AuthenticationStatus.RECOVERY_CODE_INVALID);
            expect(authenticationRepository.updatePasswordByLogin).not.toHaveBeenCalled();
        });

        it('should reset the password and consume the code with a valid code', async () => {
            recoveryCodeRepository.getByLogin.mockResolvedValue({ login: 'user', code: codeHash, expiresAt: future(), attempts: 0 });
            authenticationRepository.updatePasswordByLogin.mockResolvedValue(true);

            const result = await service.manageAuthentication({ id: 'x', login: 'user', password: '', isRecovery: true, code: 'ABC234', newPassword: 'new-pass' });

            expect(result.status).toBe(AuthenticationStatus.PASSWORD_RESET);
            const savedHash = authenticationRepository.updatePasswordByLogin.mock.calls[0][1] as string;
            expect(bcrypt.compareSync('new-pass', savedHash)).toBe(true);
            expect(recoveryCodeRepository.deleteByLogin).toHaveBeenCalledWith('user');
        });
    });
});
