import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { JwtPayload } from './jwt-payload.interface';

@Injectable()
export class WsJwtGuard implements CanActivate {
    public canActivate(context: ExecutionContext): boolean {
        const client: Socket = context.switchToWs().getClient<Socket>();
        const user = client.data?.user as JwtPayload | undefined;
        if (!user) {
            throw new WsException('Unauthorized');
        }
        return true;
    }
}
