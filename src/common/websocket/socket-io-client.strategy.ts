import { CustomTransportStrategy, Server } from '@nestjs/microservices';
import { isObservable, firstValueFrom } from 'rxjs';
import { Socket } from 'socket.io-client';

export class SocketIoClientStrategy extends Server
    implements CustomTransportStrategy {
    public constructor(private client: Socket, private isLocal: boolean) {
        super();
    }

    public on<EventKey extends string = string, EventCallback extends Function = Function>(event: EventKey, callback: EventCallback): void {
        this.client.on(event, callback as never);
    }

    public unwrap<T>(): T {
        return this.client as unknown as T;
    }

    /**
     * This method is triggered when you run "app.listen()".
     */
    /* istanbul ignore next */
    public listen(callback: () => void): void {
        this.client.on('connection', () => {
          
        });
        this.client.on('error', (error) => {
         
        });
        this.client.on('connected', (connected) => {
          
        });



        this.messageHandlers.forEach((handler, pattern) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.client.on(pattern, async (data: any, callb: (response: unknown) => void) => {
                try {
                    const result = await handler(data, this.client);
                    const response = isObservable(result) ? await firstValueFrom(result) : result;
                    callb({ response });
                } catch (error) {
                    callb({ err: error?.message ?? error });
                }
            });
        });

        callback();
    }

    /**
     * This method is triggered on application shutdown.
     */
    /* istanbul ignore next */
    public close(): void {
        this.client.disconnect();
    }
}