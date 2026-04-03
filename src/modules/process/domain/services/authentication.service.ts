/* eslint-disable max-lines-per-function */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Logger } from 'nestjs-pino';
import { AuthenticationRepository } from '@process/infrastructure/repositories/authentication.repository';
import { AuthenticationModel } from '../models/authentication.model';
import * as bcrypt from "bcrypt";
import * as fs from 'fs'
import { ConfigService } from '@nestjs/config';
import { JwtPayload, TokensResponse } from '../../../../common/auth/jwt-payload.interface';

@Injectable()
export class AuthenticationService {
    public constructor(
        private authenticationRepository: AuthenticationRepository,
        private readonly _config: ConfigService,
        private readonly _jwtService: JwtService,
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

    public async checkPassword(data: AuthenticationModel): Promise<boolean> {
        const result = await bcrypt.compare(data.password, (await this.authenticationRepository.get()).password);
        if (!result) {
            this.logger.warn({ login: data.login }, 'authentication failed');
        }
        return result;
    }

    public async login(data: AuthenticationModel): Promise<TokensResponse> {
        const valid = await this.checkPassword(data);
        if (!valid) {
            throw new UnauthorizedException('Invalid credentials');
        }
        return this._generateTokens(data.login);
    }

    public async refreshTokens(refreshToken: string): Promise<TokensResponse> {
        try {
            const payload = this._jwtService.verify<JwtPayload>(refreshToken, {
                secret: this._config.get<string>('JWT_REFRESH_SECRET'),
            });
            return this._generateTokens(payload.sub);
        } catch {
            throw new UnauthorizedException('Invalid refresh token');
        }
    }

    private _generateTokens(sub: string): TokensResponse {
        const payload: JwtPayload = { sub };
        const accessToken = this._jwtService.sign(payload, {
            secret: this._config.get<string>('JWT_SECRET'),
            expiresIn: '15m',
        });
        const refreshToken = this._jwtService.sign(payload, {
            secret: this._config.get<string>('JWT_REFRESH_SECRET'),
            expiresIn: '7d',
        });
        return { accessToken, refreshToken };
    }
}
