import * as bcrypt from 'bcrypt';
import { AuthenticationService } from '@process/domain/services/authentication.service';
import { AuthenticationModel } from '@process/domain/models/authentication.model';

// _getSerial() lit un fichier reel du boitier (/home/clv/udi/unique_device_id) : seul
// readFileSync est mocke pour ne jamais dependre de ce fichier physique pendant les tests ;
// le reste de fs doit rester reel car bcrypt en depend (existsSync) pour charger son binding natif.
jest.mock('fs', () => ({ ...(jest.requireActual('fs') as object), readFileSync: jest.fn() }));
import * as fs from 'fs';

function CreateLoggerMock(): { log: jest.Mock; debug: jest.Mock; warn: jest.Mock; error: jest.Mock } {
    return { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe('AuthenticationService (fs mocked)', () => {
    let authenticationRepository: { get: jest.Mock; update: jest.Mock };
    let config: { get: jest.Mock };
    let logger: ReturnType<typeof CreateLoggerMock>;
    let service: AuthenticationService;

    beforeEach(() => {
        jest.clearAllMocks();
        (fs.readFileSync as jest.Mock).mockReturnValue('device-serial-42');
        authenticationRepository = { get: jest.fn(), update: jest.fn() };
        config = { get: jest.fn().mockReturnValue('super-secret-initial-password') };
        logger = CreateLoggerMock();

        service = new AuthenticationService(authenticationRepository as never, config as never, logger as never);
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
        it('should return true and log nothing for a matching password', async () => {
            const hash = bcrypt.hashSync('correct-password', bcrypt.genSaltSync(4));
            authenticationRepository.get.mockResolvedValue({ login: 'user', password: hash });

            const isValid = await service.checkPassword({ id: 'x', login: 'user', password: 'correct-password' });

            expect(isValid).toBe(true);
            expect(logger.warn).not.toHaveBeenCalled();
        });

        it('should return false and log a warning for a mismatching password', async () => {
            const hash = bcrypt.hashSync('correct-password', bcrypt.genSaltSync(4));
            authenticationRepository.get.mockResolvedValue({ login: 'user', password: hash });

            const isValid = await service.checkPassword({ id: 'x', login: 'user', password: 'wrong-password' });

            expect(isValid).toBe(false);
            expect(logger.warn).toHaveBeenCalledWith({ login: 'user' }, 'authentication failed');
        });
    });
});
