import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Socket, io } from 'socket.io-client';

@Injectable()
export class SocketIoClientProvider {
    @Inject(ConfigService)
    private readonly _config: ConfigService;

    private _socket: Socket;
    private _localSocket: Socket;
    private _connect(isLocal: boolean): Socket {
        const socket = io(isLocal ? this._config.get('SOCKET_SERVER_LOCAL') : this._config.get('SOCKET_SERVER'), {
            extraHeaders: {
                myTestBox: '1234'
            }
        });
        isLocal ? (this._localSocket = socket) : (this._socket = socket);
        return isLocal ? this._localSocket : this._socket;
    }

    public getSocket = (isLocal: boolean): Socket => {
        if ((isLocal && !this._localSocket) || (!isLocal && !this._socket)) {
            return this._connect(isLocal);
        }
        return isLocal ? this._localSocket : this._socket;
    };
}