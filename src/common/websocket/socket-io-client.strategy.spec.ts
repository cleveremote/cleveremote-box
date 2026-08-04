import { throwError } from 'rxjs';
import { SocketIoClientStrategy } from './socket-io-client.strategy';

function CreateMockSocket(): { on: jest.Mock; disconnect: jest.Mock } {
    return { on: jest.fn(), disconnect: jest.fn() };
}

function getRegisteredHandler(socket: { on: jest.Mock }, pattern: string): (data: unknown, callb: (response: unknown) => void) => Promise<void> {
    const call = socket.on.mock.calls.find(([event]) => event === pattern);
    return call[1];
}

describe('SocketIoClientStrategy', () => {
    it('should be defined', () => {
        expect(new SocketIoClientStrategy(CreateMockSocket() as never, false)).toBeDefined();
    });

    it('should delegate on() to the underlying socket client', () => {
        const socket = CreateMockSocket();
        const strategy = new SocketIoClientStrategy(socket as never, false);
        const callback = jest.fn();

        strategy.on('some-event', callback);

        expect(socket.on).toHaveBeenCalledWith('some-event', callback);
    });

    it('should unwrap and return the underlying socket client', () => {
        const socket = CreateMockSocket();
        const strategy = new SocketIoClientStrategy(socket as never, true);

        expect(strategy.unwrap()).toBe(socket);
    });

    describe('listen()', () => {
        it('should forward a successful handler result wrapped as { response }', async () => {
            const socket = CreateMockSocket();
            const strategy = new SocketIoClientStrategy(socket as never, false);
            const handler = jest.fn().mockResolvedValue('ok');
            (strategy as unknown as { messageHandlers: Map<string, unknown> }).messageHandlers = new Map([['some-pattern', handler]]);

            strategy.listen(jest.fn());
            const registeredHandler = getRegisteredHandler(socket, 'some-pattern');
            const callb = jest.fn();
            await registeredHandler({ foo: 'bar' }, callb);

            expect(handler).toHaveBeenCalledWith({ foo: 'bar' }, socket);
            expect(callb).toHaveBeenCalledWith({ response: 'ok' });
        });

        it('should forward a rejected handler promise as { err } instead of swallowing it', async () => {
            const socket = CreateMockSocket();
            const strategy = new SocketIoClientStrategy(socket as never, false);
            const handler = jest.fn().mockRejectedValue(new Error('_id should not be empty'));
            (strategy as unknown as { messageHandlers: Map<string, unknown> }).messageHandlers = new Map([['some-pattern', handler]]);

            strategy.listen(jest.fn());
            const registeredHandler = getRegisteredHandler(socket, 'some-pattern');
            const callb = jest.fn();
            await registeredHandler({}, callb);

            expect(callb).toHaveBeenCalledWith({ err: '_id should not be empty' });
        });

        it('should subscribe to an Observable result and forward its emitted error as { err }', async () => {
            const socket = CreateMockSocket();
            const strategy = new SocketIoClientStrategy(socket as never, false);
            const handler = jest.fn().mockResolvedValue(throwError(() => ({ status: 'error', message: '_id should not be empty' })));
            (strategy as unknown as { messageHandlers: Map<string, unknown> }).messageHandlers = new Map([['some-pattern', handler]]);

            strategy.listen(jest.fn());
            const registeredHandler = getRegisteredHandler(socket, 'some-pattern');
            const callb = jest.fn();
            await registeredHandler({}, callb);

            expect(callb).toHaveBeenCalledWith({ err: '_id should not be empty' });
        });
    });
});
