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
                console.log('response', response);

                if (!response) return reject('err')
                resolve(response);
            })
        });
    }

    publish(
        packet: ReadPacket<any>,
        callback: (packet: WritePacket<any>) => void,
    ): () => void {
        console.log('message:', packet);

        // In a real-world application, the "callback" function should be executed
        // with payload sent back from the responder. Here, we'll simply simulate (5 seconds delay)
        // that response came through by passing the same "data" as we've originally passed in.
        setTimeout(() => callback({ response: packet.data }), 5000);

        return () => console.log('teardown');
    }
}