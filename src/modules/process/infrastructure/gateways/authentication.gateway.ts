import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';
import { AuthenticationService } from '@process/domain/services/authentication.service';
import { AuthenticationModel } from '@process/domain/models/authentication.model';
import { TokensResponse } from '../../../../common/auth/jwt-payload.interface';

@WebSocketGateway({ cors: { origin: '*' } })
export class AuthenticationGateway {

    public constructor(
        private _authenticationService: AuthenticationService) {
    }

    @SubscribeMessage('box/auth/login')
    public async login(@MessageBody() authenticationDto: AuthenticationModel): Promise<TokensResponse> {
        return this._authenticationService.login(authenticationDto);
    }

    @SubscribeMessage('box/auth/refresh')
    public async refresh(@MessageBody() body: { refreshToken: string }): Promise<TokensResponse> {
        return this._authenticationService.refreshTokens(body.refreshToken);
    }

    @SubscribeMessage('box/check/connection')
    public async checkConnection(): Promise<boolean> {
        return true;
    }
}
