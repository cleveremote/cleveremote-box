/* eslint-disable max-lines-per-function */
import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AuthenticationRepository } from '@process/infrastructure/repositories/authentication.repository';
import { AuthenticationModel } from '../models/authentication.model';
import { AUTHENTICATION_SUCCESS_STATUSES, AuthenticationResultModel, AuthenticationStatus } from '../models/authentication-result.model';
import * as bcrypt from 'bcrypt';
//var fs = require('fs');
import * as fs from 'fs'
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import { RecoveryCodeRepository } from '@process/infrastructure/repositories/recovery-code.repository';
import { MailService } from './mail.service';
import { GlobalSettingsService } from './global-settings.service';
import { DescribeAuthentication } from '../utils/authentication-messages';

const RECOVERY_CODE_LENGTH = 6;
const RECOVERY_CODE_TTL_MS = 1 * 60 * 1000;
// sans 0/O ni 1/I pour éviter les confusions à la saisie
const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_RECOVERY_CODE_ATTEMPTS = 5;

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

@Injectable()
export class AuthenticationService {
    public constructor(
        private authenticationRepository: AuthenticationRepository,
        private readonly recoveryCodeRepository: RecoveryCodeRepository,
        private readonly mailService: MailService,
        private readonly globalSettingsService: GlobalSettingsService,
        private readonly _config: ConfigService,
        private readonly logger: Logger
    ) {
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

    public async manageAuthentication(data: AuthenticationModel): Promise<AuthenticationResultModel> {
        if (data.isRecovery) {
            return data.code ? this._resetPassword(data.login, data.code, data.newPassword) : this._sendRecoveryCode(data.login);
        }
        if (!data.password) {
            this.logger.warn({ login: data.login }, 'authentication failed : no password provided');
            return this._result(AuthenticationStatus.MISSING_PASSWORD);
        }
        const stored = await this.authenticationRepository.get();
        if (!stored.password) {
            this.logger.warn({ login: data.login }, 'authentication failed : no credentials stored');
            return this._result(AuthenticationStatus.NOT_INITIALIZED);
        }
        // verrou actif : refus sans comparer le mot de passe ni incrémenter le compteur
        if (stored.lockedUntil && stored.lockedUntil.getTime() > Date.now()) {
            this.logger.warn({ login: data.login, failedAttempts: stored.failedAttempts, lockedUntil: stored.lockedUntil }, 'authentication refused : account locked');
            return this._result(AuthenticationStatus.ACCOUNT_LOCKED, { failedAttempts: stored.failedAttempts, lockedUntil: stored.lockedUntil });
        }
        const isValid = await bcrypt.compare(data.password, stored.password);
        if (isValid) {
            if (stored.failedAttempts || stored.lockedUntil) {
                await this.authenticationRepository.resetFailedAttempts(stored.id);
            }
            return this._result(AuthenticationStatus.SUCCESS);
        }
        return this._registerFailure(stored, data.login);
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

    // Génère un code, le stocke haché (remplace un éventuel code précédent) et l'envoie à l'email du login
    private async _sendRecoveryCode(login: string): Promise<AuthenticationResultModel> {
        const user = login ? await this.authenticationRepository.findByLogin(login) : null;
        if (!user?.email) {
            this.logger.warn({ login }, 'recovery code not sent : unknown login or no email');
            return this._result(AuthenticationStatus.RECOVERY_UNAVAILABLE);
        }
        const code = this._generateRecoveryCode();
        const expiresAt = new Date(Date.now() + RECOVERY_CODE_TTL_MS);
        await this.recoveryCodeRepository.upsert(login, bcrypt.hashSync(code, bcrypt.genSaltSync(10)), expiresAt);
        try {
            await this.mailService.send(
                user.email,
                'CleveRemote - code de récupération',
                `Votre code de récupération : ${code}\nIl expire dans ${RECOVERY_CODE_TTL_MS / 60000} minutes.`
            );
            return this._result(AuthenticationStatus.RECOVERY_CODE_SENT, { codeExpiresAt: expiresAt });
        } catch (error) {
            this.logger.warn({ login, err: error?.message }, 'recovery code mail failed');
            await this.recoveryCodeRepository.deleteByLogin(login);
            return this._result(AuthenticationStatus.RECOVERY_MAIL_FAILED);
        }
    }

    // code seul : vérification (code conservé pour l'étape suivante) ;
    // code + newPassword : revérification du code puis remplacement du mot de passe (code consommé)
    private async _resetPassword(login: string, code: string, newPassword?: string): Promise<AuthenticationResultModel> {
        const verification = await this._verifyRecoveryCode(login, code);
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

    // ne supprime pas un code valide ; un code invalidé (trop d'essais) est supprimé
    private async _verifyRecoveryCode(login: string, code: string): Promise<AuthenticationResultModel> {
        const stored = login ? await this.recoveryCodeRepository.getByLogin(login) : null;
        if (!stored || stored.expiresAt.getTime() < Date.now()) {
            this.logger.warn({ login }, 'recovery failed : no code or code expired');
            return this._result(AuthenticationStatus.RECOVERY_CODE_EXPIRED);
        }
        if (stored.attempts >= MAX_RECOVERY_CODE_ATTEMPTS) {
            await this.recoveryCodeRepository.deleteByLogin(login);
            return this._result(AuthenticationStatus.RECOVERY_CODE_TOO_MANY_ATTEMPTS, { failedAttempts: stored.attempts });
        }
        const isValid = await bcrypt.compare(code.trim().toUpperCase(), stored.code);
        if (isValid) {
            return this._result(AuthenticationStatus.RECOVERY_CODE_VALID, { codeExpiresAt: stored.expiresAt });
        }
        const attempts = await this.recoveryCodeRepository.incrementAttempts(login);
        if (attempts >= MAX_RECOVERY_CODE_ATTEMPTS) {
            this.logger.warn({ login, attempts }, 'recovery failed : too many invalid codes, code invalidated');
            await this.recoveryCodeRepository.deleteByLogin(login);
            return this._result(AuthenticationStatus.RECOVERY_CODE_TOO_MANY_ATTEMPTS, { failedAttempts: attempts });
        }
        this.logger.warn({ login, attempts }, 'recovery failed : invalid code');
        return this._result(AuthenticationStatus.RECOVERY_CODE_INVALID, {
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
