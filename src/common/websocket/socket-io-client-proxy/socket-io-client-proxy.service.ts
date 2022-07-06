import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy, ReadPacket, WritePacket } from '@nestjs/microservices';
import { SocketIoClientProvider } from '../socket-io-client.provider';

@Injectable()
export class SocketIoClientProxyService extends ClientProxy {
    @Inject(SocketIoClientProvider)
    private _client: SocketIoClientProvider;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public async connect(): Promise<any> {
        this._client.getSocket();
    }

    public async close(): Promise<void> {
        this._client.getSocket().disconnect();
    }

    /**
     * this method use when you use SocketIoClientProxyService.emit
     * @param packet
     * @returns
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public async dispatchEvent(packet: ReadPacket<string>): Promise<any> {
        return this._emitMessage(packet);
    }

    public async sendMessage(packet: ReadPacket<string>): Promise<string> {
        return this._emitMessage<string>(packet);
    }

    private async _emitMessage<T>(packet: ReadPacket<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this._client.getSocket().emit(packet.pattern, packet.data, (response) => {
                if (!response) return reject('err')
                resolve(response);
            })
        });
    }

    /* istanbul ignore next */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public publish(_packet: ReadPacket, _callback: (packet: WritePacket) => void): () => void { return () => console.log('empty') }
}