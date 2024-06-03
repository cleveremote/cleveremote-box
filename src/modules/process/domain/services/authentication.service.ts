/* eslint-disable max-lines-per-function */
import { Injectable } from '@nestjs/common';
import { AuthenticationRepository } from '@process/infrastructure/repositories/authentication.repository';
import { AuthenticationModel } from '../models/authentication.model';
import * as bcrypt from "bcrypt";
import * as generator from "generate-password";
//var fs = require('fs');
import * as fs from 'fs'

@Injectable()
export class AuthenticationService {
    public constructor(
        private authenticationRepository: AuthenticationRepository) {
    }

    private async _managePassword(): Promise<AuthenticationModel> {
        const salt = bcrypt.genSaltSync(13);
        const palainPassword = generator.generate({
            length: 13,
            numbers: true,
            symbols: true
        });
        console.log('palainPassword', palainPassword);
        const password = bcrypt.hashSync(palainPassword, salt);
        const login: string = this._getSerial();
        console.log("password & login", password, '', login);
        return { login, password };
    }

    public _getSerial(): string {
        const content = fs.readFileSync('/proc/cpuinfo', 'utf8');
        const contArray = content.split('\n');
        const serialLine = contArray[contArray.length - 3];
        const serial = serialLine.split(':');
        return serial[1].slice(1);
    }

    public async initAuthentication(exec: boolean): Promise<boolean> {
        if (exec) {
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
