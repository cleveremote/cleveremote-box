import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { JwtService } from '@nestjs/jwt';
import { ServerOptions, Socket } from 'socket.io';
import { JwtPayload } from '../auth/jwt-payload.interface';

export class SocketIoAdapter extends IoAdapter {
    private readonly _jwtService: JwtService;

    public constructor(app: INestApplicationContext) {
        super(app);
        this._jwtService = app.get(JwtService);
    }

    public override createIOServer(port: number, options?: ServerOptions) {
        const server = super.createIOServer(port, options);

        server.use((socket: Socket, next: (err?: Error) => void) => {
            const token =
                socket.handshake.auth?.token ||
                socket.handshake.headers?.authorization?.replace('Bearer ', '');

            if (!token) {
                return next();
            }

            try {
                const payload = this._jwtService.verify<JwtPayload>(token);
                socket.data.user = payload;
                return next();
            } catch {
                return next(new Error('Invalid token'));
            }
        });

        return server;
    }
}
