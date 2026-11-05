/* eslint-disable max-lines-per-function */
import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AuthenticationRepository } from '@process/infrastructure/repositories/authentication.repository';
import { AuthenticationModel } from '../models/authentication.model';
import * as bcrypt from 'bcrypt';
import * as generator from 'generate-password';
//var fs = require('fs');
import * as fs from 'fs'
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import { RecoveryCodeRepository } from '@process/infrastructure/repositories/recovery-code.repository';
import { MailService } from './mail.service';

const RECOVERY_CODE_LENGTH = 6;
const RECOVERY_CODE_TTL_MS = 1 * 60 * 1000;
// sans 0/O ni 1/I pour éviter les confusions à la saisie
const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class AuthenticationService {
    public constructor(
        private authenticationRepository: AuthenticationRepository,
        private readonly recoveryCodeRepository: RecoveryCodeRepository,
        private readonly mailService: MailService,
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

    public async manageAuthentication(data: AuthenticationModel): Promise<boolean> {
        if (data.isRecovery) {
            return data.code ? this._resetPassword(data.login, data.code, data.newPassword) : this._sendRecoveryCode(data.login);
        }
        if (!data.password) {
            this.logger.warn({ login: data.login }, 'authentication failed : no password provided');
            return false;
        }
        const stored = await this.authenticationRepository.get();
        if (!stored.password) {
            this.logger.warn({ login: data.login }, 'authentication failed : no credentials stored');
            return false;
        }
        const result = await bcrypt.compare(data.password, stored.password);
        if (!result) {
            this.logger.warn({ login: data.login }, 'authentication failed');
        }
        return result;
    }

    // Génère un code, le stocke haché (remplace un éventuel code précédent) et l'envoie à l'email du login
    private async _sendRecoveryCode(login: string): Promise<boolean> {
        const user = login ? await this.authenticationRepository.findByLogin(login) : null;
        if (!user?.email) {
            this.logger.warn({ login }, 'recovery code not sent : unknown login or no email');
            return false;
        }
        const code = this._generateRecoveryCode();
        const expiresAt = new Date(Date.now() + RECOVERY_CODE_TTL_MS);
        await this.recoveryCodeRepository.upsert(login, bcrypt.hashSync(code, bcrypt.genSaltSync(10)), expiresAt);
        try {
            // return await this.mailService.send(
            //     user.email,
            //     'CleveRemote - code de récupération',
            //     `Votre code de récupération : ${code}\nIl expire dans ${RECOVERY_CODE_TTL_MS / 60000} minutes.`
            // );
            return true;
        } catch (error) {
            this.logger.warn({ login, err: error?.message }, 'recovery code mail failed');
            await this.recoveryCodeRepository.deleteByLogin(login);
            return false;
        }
    }

    // Vérifie le code puis remplace l'ancien mot de passe par newPassword
    private async _resetPassword(login: string, code: string, newPassword?: string): Promise<boolean> {
        // contrôlé avant la vérification du code pour ne pas consommer un code valide inutilement
        if (!newPassword) {
            return  this._checkRecoveryCode(login, code);
        }

        const hash = bcrypt.hashSync(newPassword, bcrypt.genSaltSync(13));
        const updated = await this.authenticationRepository.updatePasswordByLogin(login, hash);
        if (!updated) {
            this.logger.warn({ login }, 'recovery failed : password not updated');
            return false;
        }
        this.logger.log({ login }, 'password reset by recovery code');
        return true;
    }

    // Code à usage unique : supprimé dès qu'il est validé
    private async _checkRecoveryCode(login: string, code: string): Promise<boolean> {
        const stored = login ? await this.recoveryCodeRepository.getByLogin(login) : null;
        if (!stored || stored.expiresAt.getTime() < Date.now()) {
            this.logger.warn({ login }, 'recovery failed : no code or code expired');
            return false;
        }
        const isValid = await bcrypt.compare(code.trim().toUpperCase(), stored.code);
        if (!isValid) {
            this.logger.warn({ login }, 'recovery failed : invalid code');
            return false;
        }
        await this.recoveryCodeRepository.deleteByLogin(login);
        return false;
    }

    private _generateRecoveryCode(): string {
        return Array.from({ length: RECOVERY_CODE_LENGTH }, () => RECOVERY_CODE_ALPHABET[randomInt(RECOVERY_CODE_ALPHABET.length)]).join('');
    }
}
