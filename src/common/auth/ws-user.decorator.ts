import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Socket } from 'socket.io';
import { JwtPayload } from './jwt-payload.interface';

export const WsUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): JwtPayload => {
        const client = ctx.switchToWs().getClient<Socket>();
        return client.data.user as JwtPayload;
    },
);
