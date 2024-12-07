import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Socket, io } from 'socket.io-client';
import * as fs from 'fs'

@Injectable()
export class SocketIoClientProvider {
    @Inject(ConfigService)
    private readonly _config: ConfigService;

    private _socket: Socket;
    private _localSocket: Socket;
    
    public _getSerial(): string {
        const content = fs.readFileSync('/proc/cpuinfo', 'utf8');
        const contArray = content.split('\n');
        const serialLine = contArray[contArray.length - 3];
        const serial = serialLine.split(':');
        return serial[1].slice(1); 
    }

    private _connect(isLocal: boolean): Socket {
        const socket = io(isLocal ? this._config.get('SOCKET_SERVER_LOCAL') : this._config.get('SOCKET_SERVER'), {
            extraHeaders: {
                boxId: this._getSerial(),
                type:'box'
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