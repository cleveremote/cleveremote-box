/* eslint-disable max-lines-per-function */
import { Injectable } from '@nestjs/common';
import { AuthenticationRepository } from '@process/infrastructure/repositories/authentication.repository';
import { exec } from "child_process";
import { AuthenticationModel } from '../models/authentication.model';
import * as bcrypt from "bcrypt";
import * as generator from "generate-password";

@Injectable()
export class AuthenticationService {
    public constructor(
        private authenticationRepository: AuthenticationRepository) {
    }

    private async execCommand(cmd: string): Promise<string> {
        const result = (): Promise<string> => {
            return new Promise((resolve, reject) => {
                exec(cmd, (error, stdout, stderr) => {
                    if (error) {
                        console.log(`error: ${error.message}`);
                        return;
                    }
                    if (stderr) {
                        console.log(`stderr: ${stderr}`);
                        return;
                    }
                    resolve(stdout)
                });
            })
        }
        return await result();
    }

    private async managePassword(): Promise<AuthenticationModel> {
        const salt = bcrypt.genSaltSync(13);
        const palainPassword = generator.generate({
            length: 10,
            numbers: true,
            symbols: true
        });
        console.log('palainPassword',palainPassword);
        const password = bcrypt.hashSync(palainPassword, salt);
        const login: string = this.getserial();
        console.log("password & login", password, '', login);
        return { login, password };
    }

    private getserial() {

        var fs = require('fs');

        var content = fs.readFileSync('/proc/cpuinfo', 'utf8');

        var cont_array = content.split("\n");

        var serial_line = cont_array[cont_array.length - 3];

        var serial = serial_line.split(":");

        return serial[1].slice(1);

    }

    public async initAuthentication(exec: boolean): Promise<boolean> {
        const model = await this.managePassword();
        return !!this.authenticationRepository.update(model);
    }


    public async checkPassword(password): Promise<boolean> {
        const model = await this.authenticationRepository.get();
        return await bcrypt.compare(password, model.password);
    }
}
