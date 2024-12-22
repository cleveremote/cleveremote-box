/* eslint-disable max-lines-per-function */
import { Injectable } from '@nestjs/common';
import { AuthenticationRepository } from '@process/infrastructure/repositories/authentication.repository';
import { AuthenticationModel } from '../models/authentication.model';
import * as bcrypt from "bcrypt";
import * as generator from "generate-password";
//var fs = require('fs');
import * as fs from 'fs'
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthenticationService {
    public constructor(
        private authenticationRepository: AuthenticationRepository,
        private readonly _config: ConfigService
    ) {
    }

    private async _managePassword(): Promise<AuthenticationModel> {
        const salt = bcrypt.genSaltSync(13);
        // const palainPassword = generator.generate({
        //     length: 13,
        //     numbers: true,
        //     symbols: true
        // });
        const password = bcrypt.hashSync(this._config.get('INITIAL_PASSWORD'), salt);
        const login: string = this._getSerial();
        return { id: login, login, password }; 
    }

    public _getSerial(): string {
        return fs.readFileSync('/home/clv/udi/unique_device_id', 'utf8');
    }

    public async initAuthentication(): Promise<boolean> {
        const exists = await this.authenticationRepository.get();
        if (!(exists.login || exists.password) ) {
            const model = await this._managePassword();
            return !! await this.authenticationRepository.update(model);
        }
        return true;
    }

    public async checkPassword(data: AuthenticationModel): Promise<boolean> {
        const model = await this.authenticationRepository.get();
        return await bcrypt.compare(data.password, model.password);
    }
}
