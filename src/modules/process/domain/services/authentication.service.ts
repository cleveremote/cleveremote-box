/* eslint-disable max-lines-per-function */
import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AuthenticationRepository } from '@process/infrastructure/repositories/authentication.repository';
import { AccountSynchronizeModel, AuthenticationModel, ToAccountModel, VerificationCodeCheckModel, VerificationCodeSendModel } from '../models/authentication.model';
import { AccountSynchronizeResultModel, AUTHENTICATION_SUCCESS_STATUSES, AuthenticationResultModel, AuthenticationStatus } from '../models/authentication-result.model';
import * as bcrypt from 'bcrypt';
//var fs = require('fs');
import * as fs from 'fs'
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import { RecoveryCodeRepository } from '@process/infrastructure/repositories/recovery-code.repository';
import { VerificationCodeRepository } from '@process/infrastructure/repositories/verification-code.repository';
import { MailService } from './mail.service';
import { GlobalSettingsService } from './global-settings.service';
import { DescribeAuthentication } from '../utils/authentication-messages';

const RECOVERY_CODE_LENGTH = 6;
const RECOVERY_CODE_TTL_MS = 1 * 60 * 1000;
// sans 0/O ni 1/I pour éviter les confusions à la saisie
const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_RECOVERY_CODE_ATTEMPTS = 5;
const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;

// verrou progressif : [échecs consécutifs, durée du verrou] ; au-delà du dernier palier, dernier palier
const LOCKOUT_POLICY_MS: [number, number][] = [
    [5, 1 * 60 * 1000],
    [6, 5 * 60 * 1000],
    [7, 15 * 60 * 1000],
    [8, 30 * 60 * 1000],
    [9, 60 * 60 * 1000]
];
const LOCKOUT_THRESHOLD = LOCKOUT_POLICY_MS[0][0];

type ResultDetails = Omit<AuthenticationResultModel, 'success' | 'status' | 'message'>;

// stockage d'un code à usage unique haché (recovery_codes / verification_codes)
type OneTimeCodeRepository = Pick<RecoveryCodeRepository, 'getByLogin' | 'upsert' | 'incrementAttempts' | 'deleteByLogin'>;

// paramètres d'un flux "code envoyé par mail puis vérifié" (récupération de mot de passe, vérification)
interface OneTimeCodeFlow {
    name: string;
    repository: OneTimeCodeRepository;
    ttlMs: number;
    subject: string;
    body: (code: string, ttlMinutes: number) => string;
    // true : un code valide est supprimé dès la vérification
    consumeOnValid: boolean;
    statuses: {
        sent: AuthenticationStatus;
        unavailable: AuthenticationStatus;
        mailFailed: AuthenticationStatus;
        valid: AuthenticationStatus;
        invalid: AuthenticationStatus;
        expired: AuthenticationStatus;
        tooManyAttempts: AuthenticationStatus;
    };
}

@Injectable()
export class AuthenticationService {
    public constructor(
        private authenticationRepository: AuthenticationRepository,
        private readonly recoveryCodeRepository: RecoveryCodeRepository,
        private readonly verificationCodeRepository: VerificationCodeRepository,
        private readonly mailService: MailService,
        private readonly globalSettingsService: GlobalSettingsService,
        private readonly _config: ConfigService,
        private readonly logger: Logger
    ) {
    }

    private get _recoveryFlow(): OneTimeCodeFlow {
        return {
            name: 'recovery',
            repository: this.recoveryCodeRepository,
            ttlMs: RECOVERY_CODE_TTL_MS,
            subject: 'CleveRemote - code de récupération',
            body: (code, ttlMinutes) => `Votre code de récupération : ${code}\nIl expire dans ${ttlMinutes} minutes.`,
            // conservé pour l'étape code + newPassword
            consumeOnValid: false,
            statuses: {
                sent: AuthenticationStatus.RECOVERY_CODE_SENT,
                unavailable: AuthenticationStatus.RECOVERY_UNAVAILABLE,
                mailFailed: AuthenticationStatus.RECOVERY_MAIL_FAILED,
                valid: AuthenticationStatus.RECOVERY_CODE_VALID,
                invalid: AuthenticationStatus.RECOVERY_CODE_INVALID,
                expired: AuthenticationStatus.RECOVERY_CODE_EXPIRED,
                tooManyAttempts: AuthenticationStatus.RECOVERY_CODE_TOO_MANY_ATTEMPTS
            }
        };
    }

    private get _verificationFlow(): OneTimeCodeFlow {
        return {
            name: 'verification',
            repository: this.verificationCodeRepository,
            ttlMs: VERIFICATION_CODE_TTL_MS,
            subject: 'CleveRemote - code de vérification',
            body: (code, ttlMinutes) => `Votre code de vérification : ${code}\nIl expire dans ${ttlMinutes} minutes.`,
            consumeOnValid: true,
            statuses: {
                sent: AuthenticationStatus.VERIFICATION_CODE_SENT,
                unavailable: AuthenticationStatus.VERIFICATION_UNAVAILABLE,
                mailFailed: AuthenticationStatus.VERIFICATION_MAIL_FAILED,
                valid: AuthenticationStatus.VERIFICATION_CODE_VALID,
                invalid: AuthenticationStatus.VERIFICATION_CODE_INVALID,
                expired: AuthenticationStatus.VERIFICATION_CODE_EXPIRED,
                tooManyAttempts: AuthenticationStatus.VERIFICATION_CODE_TOO_MANY_ATTEMPTS
            }
        };
    }

    // box/send/verificationcode : envoi à data.email si fourni, sinon à l'email du compte ;
    // une nouvelle demande remplace le code précédent
    public async sendVerificationCode(data: VerificationCodeSendModel): Promise<AuthenticationResultModel> {
        const user = data.login ? await this.authenticationRepository.findByLogin(data.login) : null;
        return this._sendCode(this._verificationFlow, data.login, user ? (data.email || user.email) : null);
    }

    // box/check/verificationcode : un code valide est consommé (un second check renvoie VERIFICATION_CODE_EXPIRED)
    public async checkVerificationCode(data: VerificationCodeCheckModel): Promise<AuthenticationResultModel> {
        return this._verifyCode(this._verificationFlow, data.login, data.code);
    }

    private async _managePassword(): Promise<AuthenticationModel> {
        const salt = bcrypt.genSaltSync(13);
        const password = bcrypt.hashSync(this._config.get('INITIAL_PASSWORD'), salt);
        const login: string = this._getSerial();
        return { id: login, login, password };
    }

    public _getSerial(): string {
        return fs.readFileSync('/home/clv/udi/unique_device_id', 'utf8');
    }

    public async initAuthentication(): Promise<boolean> {
        const exists = await this.authenticationRepository.get();
        if (!(exists.login || exists.password)) {
            this.logger.log('no credentials found, initializing authentication');
            const model = await this._managePassword();
            return !!await this.authenticationRepository.update(model);
        }
        this.logger.log('authentication already initialized');
        return true;
    }

    // box/synchronize/account : currentPassword vérifié (verrou progressif compris) avant toute mise à jour
    // du mot de passe et/ou de l'email ; un échec compte comme une tentative de connexion ratée
    public async synchronizeAccount(account: AccountSynchronizeModel): Promise<AccountSynchronizeResultModel> {
        const stored = account.login ? await this.authenticationRepository.findByLogin(account.login) : null;
        if (!stored) {
            this.logger.warn({ login: account.login }, 'account synchronization failed : unknown login');
            return this._result(AuthenticationStatus.ACCOUNT_NOT_FOUND);
        }
        const check = await this._checkPassword(stored, account.password, account.login);
        if (check.status !== AuthenticationStatus.SUCCESS) {
            return check;
        }
        const hash = account.newPassword ? bcrypt.hashSync(account.newPassword, bcrypt.genSaltSync(13)) : undefined;
        const saved = await this.authenticationRepository.synchronizeByLogin(account.login, hash, account.email);
        if (!saved) {
            this.logger.warn({ login: account.login }, 'account synchronization failed : account not updated');
            return this._result(AuthenticationStatus.ACCOUNT_UPDATE_FAILED);
        }
        if (hash) {
            // un code de récupération en cours ne doit plus permettre d'écraser le nouveau mot de passe
            await this.recoveryCodeRepository.deleteByLogin(account.login);
        }
        this.logger.log({ login: account.login, password: !!hash, email: account.email !== undefined }, 'account synchronized');
        return { ...this._result(AuthenticationStatus.ACCOUNT_UPDATED), account: ToAccountModel(saved) };
    }

    public async manageAuthentication(data: AuthenticationModel): Promise<AuthenticationResultModel> {
        if (data.isRecovery) {
            return data.code ? this._resetPassword(data.login, data.code, data.newPassword) : this._sendRecoveryCode(data.login);
        }
        if (!data.password) {
            this.logger.warn({ login: data.login }, 'authentication failed : no password provided');
            return this._result(AuthenticationStatus.MISSING_PASSWORD);
        }
        return this._checkPassword(await this.authenticationRepository.get(), data.password, data.login);
    }

    // SUCCESS : mot de passe valide (compteur d'échecs remis à 0) ; sinon statut d'erreur à renvoyer tel quel
    private async _checkPassword(stored: AuthenticationModel, password: string, login: string): Promise<AuthenticationResultModel> {
        if (!password) {
            this.logger.warn({ login }, 'authentication failed : no password provided');
            return this._result(AuthenticationStatus.MISSING_PASSWORD);
        }
        if (!stored.password) {
            this.logger.warn({ login }, 'authentication failed : no credentials stored');
            return this._result(AuthenticationStatus.NOT_INITIALIZED);
        }
        // verrou actif : refus sans comparer le mot de passe ni incrémenter le compteur
        if (stored.lockedUntil && stored.lockedUntil.getTime() > Date.now()) {
            this.logger.warn({ login, failedAttempts: stored.failedAttempts, lockedUntil: stored.lockedUntil }, 'authentication refused : account locked');
            return this._result(AuthenticationStatus.ACCOUNT_LOCKED, { failedAttempts: stored.failedAttempts, lockedUntil: stored.lockedUntil });
        }
        const isValid = await bcrypt.compare(password, stored.password);
        if (isValid) {
            if (stored.failedAttempts || stored.lockedUntil) {
                await this.authenticationRepository.resetFailedAttempts(stored.id);
            }
            return this._result(AuthenticationStatus.SUCCESS);
        }
        return this._registerFailure(stored, login);
    }

    private async _registerFailure(stored: AuthenticationModel, login: string): Promise<AuthenticationResultModel> {
        const failedAttempts = await this.authenticationRepository.incrementFailedAttempts(stored.id);
        const delay = this._lockoutDelay(failedAttempts);
        if (!delay) {
            this.logger.warn({ login, failedAttempts }, 'authentication failed');
            return this._result(AuthenticationStatus.INVALID_CREDENTIALS, {
                failedAttempts,
                attemptsRemaining: LOCKOUT_THRESHOLD - failedAttempts
            });
        }
        const lockedUntil = new Date(Date.now() + delay);
        await this.authenticationRepository.setLockedUntil(stored.id, lockedUntil);
        this.logger.warn({ login, failedAttempts, lockedUntil }, 'authentication failed : account locked');
        return this._result(AuthenticationStatus.ACCOUNT_LOCKED, { failedAttempts, lockedUntil });
    }

    // 0 : pas de verrou
    private _lockoutDelay(failedAttempts: number): number {
        let delay = 0;
        for (const [threshold, duration] of LOCKOUT_POLICY_MS) {
            if (failedAttempts >= threshold) {
                delay = duration;
            }
        }
        return delay;
    }

    private async _sendRecoveryCode(login: string): Promise<AuthenticationResultModel> {
        const user = login ? await this.authenticationRepository.findByLogin(login) : null;
        return this._sendCode(this._recoveryFlow, login, user?.email);
    }

    // Génère un code, le stocke haché (remplace un éventuel code précédent) et l'envoie à email
    private async _sendCode(flow: OneTimeCodeFlow, login: string, email: string | null | undefined): Promise<AuthenticationResultModel> {
        if (!login || !email) {
            this.logger.warn({ login }, `${flow.name} code not sent : unknown login or no email`);
            return this._result(flow.statuses.unavailable);
        }
        const code = this._generateRecoveryCode();
        const expiresAt = new Date(Date.now() + flow.ttlMs);
        await flow.repository.upsert(login, bcrypt.hashSync(code, bcrypt.genSaltSync(10)), expiresAt);
        try {
            await this.mailService.send(email, flow.subject, flow.body(code, flow.ttlMs / 60000));
            return this._result(flow.statuses.sent, { codeExpiresAt: expiresAt });
        } catch (error) {
            this.logger.warn({ login, err: error?.message }, `${flow.name} code mail failed`);
            await flow.repository.deleteByLogin(login);
            return this._result(flow.statuses.mailFailed);
        }
    }

    // code seul : vérification (code conservé pour l'étape suivante) ;
    // code + newPassword : revérification du code puis remplacement du mot de passe (code consommé)
    private async _resetPassword(login: string, code: string, newPassword?: string): Promise<AuthenticationResultModel> {
        const verification = await this._verifyCode(this._recoveryFlow, login, code);
        if (!newPassword || verification.status !== AuthenticationStatus.RECOVERY_CODE_VALID) {
            return verification;
        }
        const hash = bcrypt.hashSync(newPassword, bcrypt.genSaltSync(13));
        const updated = await this.authenticationRepository.updatePasswordByLogin(login, hash);
        if (!updated) {
            this.logger.warn({ login }, 'recovery failed : password not updated');
            return this._result(AuthenticationStatus.PASSWORD_RESET_FAILED);
        }
        await this.recoveryCodeRepository.deleteByLogin(login);
        this.logger.log({ login }, 'password reset by recovery code');
        return this._result(AuthenticationStatus.PASSWORD_RESET);
    }

    // un code valide n'est supprimé que si flow.consumeOnValid ; un code invalidé (trop d'essais) est supprimé
    private async _verifyCode(flow: OneTimeCodeFlow, login: string, code: string): Promise<AuthenticationResultModel> {
        const stored = login ? await flow.repository.getByLogin(login) : null;
        if (!stored || stored.expiresAt.getTime() < Date.now()) {
            this.logger.warn({ login }, `${flow.name} failed : no code or code expired`);
            return this._result(flow.statuses.expired);
        }
        if (stored.attempts >= MAX_RECOVERY_CODE_ATTEMPTS) {
            await flow.repository.deleteByLogin(login);
            return this._result(flow.statuses.tooManyAttempts, { failedAttempts: stored.attempts });
        }
        const isValid = !!code && await bcrypt.compare(code.trim().toUpperCase(), stored.code);
        if (isValid) {
            if (flow.consumeOnValid) {
                await flow.repository.deleteByLogin(login);
            }
            return this._result(flow.statuses.valid, { codeExpiresAt: stored.expiresAt });
        }
        const attempts = await flow.repository.incrementAttempts(login);
        if (attempts >= MAX_RECOVERY_CODE_ATTEMPTS) {
            this.logger.warn({ login, attempts }, `${flow.name} failed : too many invalid codes, code invalidated`);
            await flow.repository.deleteByLogin(login);
            return this._result(flow.statuses.tooManyAttempts, { failedAttempts: attempts });
        }
        this.logger.warn({ login, attempts }, `${flow.name} failed : invalid code`);
        return this._result(flow.statuses.invalid, {
            failedAttempts: attempts,
            attemptsRemaining: MAX_RECOVERY_CODE_ATTEMPTS - attempts
        });
    }

    // point de sortie unique : message traduit dans la langue et le fuseau de la box
    private _result(status: AuthenticationStatus, details: ResultDetails = {}): AuthenticationResultModel {
        const result: AuthenticationResultModel = { success: AUTHENTICATION_SUCCESS_STATUSES.has(status), status, message: '', ...details };
        result.message = DescribeAuthentication(result, this.globalSettingsService.language, this.globalSettingsService.timeZone);
        return result;
    }

    private _generateRecoveryCode(): string {
        return Array.from({ length: RECOVERY_CODE_LENGTH }, () => RECOVERY_CODE_ALPHABET[randomInt(RECOVERY_CODE_ALPHABET.length)]).join('');
    }
}
