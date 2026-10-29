import ModbusRTU from 'modbus-serial';
import { ModbusConnection, ModbusTransport } from '@register-map/domain/models/modbus-connection.model';
import { RegisterFunction } from '@register-map/domain/models/register-map.model';
import { ModbusBusService } from '@register-map/domain/services/modbus-bus.service';

type MockClient = Record<string, jest.Mock>;

// 'modbus-serial' entièrement mocké : aucun test n'ouvre un vrai port série/TCP
const mockClients: MockClient[] = [];
function CreateMockClient(overrides: Partial<MockClient> = {}): MockClient {
    const client: MockClient = {
        connectTCP: jest.fn().mockResolvedValue(undefined),
        connectRTUBuffered: jest.fn().mockResolvedValue(undefined),
        setID: jest.fn(),
        setTimeout: jest.fn(),
        readCoils: jest.fn().mockResolvedValue({ data: [true, false, true, false, false, false, false, false] }),
        readDiscreteInputs: jest.fn().mockResolvedValue({ data: new Array(8).fill(false) }),
        readHoldingRegisters: jest.fn().mockResolvedValue({ data: [1, 2] }),
        readInputRegisters: jest.fn().mockResolvedValue({ data: [3] }),
        writeCoil: jest.fn().mockResolvedValue({}),
        writeCoils: jest.fn().mockResolvedValue({}),
        writeRegister: jest.fn().mockResolvedValue({}),
        writeRegisters: jest.fn().mockResolvedValue({}),
        writeCustomFC: jest.fn((_id: number, _fc: number, _data: Buffer, next: (err: Error | null) => void) => next(null)),
        close: jest.fn((cb?: () => void) => cb?.()),
        destroy: jest.fn((cb?: () => void) => cb?.()),
        ...overrides
    };
    mockClients.push(client);
    return client;
}

jest.mock('modbus-serial', () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => CreateMockClient())
}));

const TCP: ModbusConnection = { transport: ModbusTransport.TCP, host: '10.0.0.2', port: 502, unitId: 61 };
const RTU: ModbusConnection = { transport: ModbusTransport.RTU, path: '/dev/ttyUSB0', unitId: 3, timeout: 500 };

describe('ModbusBusService', () => {
    let service: ModbusBusService;

    beforeEach(() => {
        mockClients.length = 0;
        service = new ModbusBusService({ log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() } as any);
    });

    it('should connect over TCP, set the unit id and close the connection after a read', async () => {
        const data = await service.execute(TCP, { function: RegisterFunction.READ_HOLDING_REGISTERS, address: 10, length: 2 });

        const [client] = mockClients;
        expect(client.connectTCP).toHaveBeenCalledWith('10.0.0.2', { port: 502, timeout: 2000 });
        expect(client.setID).toHaveBeenCalledWith(61);
        expect(client.setTimeout).toHaveBeenCalledWith(2000);
        expect(client.readHoldingRegisters).toHaveBeenCalledWith(10, 2);
        expect(data).toEqual([1, 2]);
        expect(client.close).toHaveBeenCalled();
    });

    it('should connect over RTU with the default baud rate', async () => {
        await service.execute(RTU, { function: RegisterFunction.READ_INPUT_REGISTERS, address: 0, length: 1 });

        expect(mockClients[0].connectRTUBuffered).toHaveBeenCalledWith('/dev/ttyUSB0', { baudRate: 9600 });
        expect(mockClients[0].setTimeout).toHaveBeenCalledWith(500);
    });

    it('should truncate coils to the requested length', async () => {
        const data = await service.execute(TCP, { function: RegisterFunction.READ_COILS, address: 0, length: 3 });

        expect(data).toEqual([true, false, true]);
    });

    it('should send a custom FC05 frame on each coil of a custom range', async () => {
        await service.execute(TCP, { function: RegisterFunction.CUSTOM_MULTIPLE_COILS, address: 2, length: 2, value: 0x5500 });

        const calls = mockClients[0].writeCustomFC.mock.calls.map(([id, fc, data]) => [id, fc, [...data]]);
        expect(calls).toEqual([[61, 0x05, [0, 2, 0x55, 0]], [61, 0x05, [0, 3, 0x55, 0]]]);
    });

    it('should retry once with the connection given by onUnreachable', async () => {
        const unreachable = Object.assign(new Error('unreachable'), { code: 'EHOSTUNREACH' });
        (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
            connectTCP: jest.fn().mockRejectedValueOnce(unreachable).mockResolvedValue(undefined)
        }));
        const onUnreachable = jest.fn().mockResolvedValue({ ...TCP, host: '10.0.0.9' });

        await service.execute({ ...TCP, onUnreachable }, { function: RegisterFunction.WRITE_SINGLE_COIL, address: 1, length: 1, value: 1 });

        expect(mockClients[0].connectTCP).toHaveBeenLastCalledWith('10.0.0.9', { port: 502, timeout: 2000 });
        expect(mockClients[0].destroy).toHaveBeenCalledTimes(1);
        expect(mockClients[0].writeCoil).toHaveBeenCalledWith(1, true);
    });

    it('should retry with onUnreachable after a TCP connection timeout', async () => {
        const timedOut = new Error('TCP Connection Timed Out');
        (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
            connectTCP: jest.fn().mockRejectedValueOnce(timedOut).mockResolvedValue(undefined)
        }));
        const onUnreachable = jest.fn().mockResolvedValue({ ...TCP, host: '10.0.0.9' });

        await service.execute({ ...TCP, timeout: 500, onUnreachable }, { function: RegisterFunction.READ_HOLDING_REGISTERS, address: 0, length: 1 });

        expect(onUnreachable).toHaveBeenCalled();
        expect(mockClients[0].connectTCP.mock.calls).toEqual([['10.0.0.2', { port: 502, timeout: 500 }], ['10.0.0.9', { port: 502, timeout: 500 }]]);
    });

    it('should release the socket and propagate the error when the connection fails without retry', async () => {
        const refused = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
        (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
            connectTCP: jest.fn().mockRejectedValue(refused)
        }));

        await expect(service.execute(TCP, { function: RegisterFunction.READ_HOLDING_REGISTERS, address: 0, length: 1 })).rejects.toBe(refused);
        expect(mockClients[0].destroy).toHaveBeenCalled();
    });

    it('should propagate Modbus errors and still close the connection', async () => {
        const exception = Object.assign(new Error('Modbus exception 2'), { modbusCode: 2 });
        (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
            writeRegister: jest.fn().mockRejectedValue(exception)
        }));

        await expect(service.execute(TCP, { function: RegisterFunction.WRITE_SINGLE_REGISTER, address: 0, length: 1, value: 5 }))
            .rejects.toBe(exception);
        expect(mockClients[0].close).toHaveBeenCalled();
    });

    describe('scan', () => {
        const read = { function: RegisterFunction.READ_HOLDING_REGISTERS, address: 0x4000, length: 1 };

        it('should query every target on a single connection and return only the responders', async () => {
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn()
                    .mockRejectedValueOnce(Object.assign(new Error('Timed out'), { errno: 'ETIMEDOUT' }))
                    .mockResolvedValueOnce({ data: [62] })
            }));

            const responses = await service.scan({ ...TCP, timeout: 200 }, [{ unitId: 1, request: read }, { unitId: 61, request: read }]);

            expect(mockClients).toHaveLength(1);
            expect(mockClients[0].setTimeout).toHaveBeenCalledWith(200);
            expect(mockClients[0].setID.mock.calls.slice(1)).toEqual([[1], [61]]);
            expect(responses).toEqual([{ unitId: 61, request: read, data: [62] }]);
            expect(mockClients[0].close).toHaveBeenCalled();
        });

        it('should propagate connection errors', async () => {
            const refused = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                connectTCP: jest.fn().mockRejectedValue(refused)
            }));

            await expect(service.scan(TCP, [{ unitId: 1, request: read }])).rejects.toBe(refused);
        });

        it('should not open any connection without targets', async () => {
            await expect(service.scan(TCP, [])).resolves.toEqual([]);
            expect(mockClients).toHaveLength(0);
        });
    });

    describe('checkConnection', () => {
        it('should open then close a connection without any request', async () => {
            await service.checkConnection(TCP);

            const [client] = mockClients;
            expect(client.connectTCP).toHaveBeenCalledWith('10.0.0.2', { port: 502, timeout: 2000 });
            expect(client.readHoldingRegisters).not.toHaveBeenCalled();
            expect(client.close).toHaveBeenCalled();
        });

        it('should propagate connection errors', async () => {
            const refused = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                connectTCP: jest.fn().mockRejectedValue(refused)
            }));

            await expect(service.checkConnection(TCP)).rejects.toBe(refused);
        });
    });

    it('should run transactions one at a time', async () => {
        const events: string[] = [];
        const slow = (name: string): Promise<string> => service.runExclusive(async () => {
            events.push(`start ${name}`);
            await new Promise((resolve) => setImmediate(resolve));
            events.push(`end ${name}`);
            return name;
        });

        await expect(Promise.all([slow('a'), slow('b')])).resolves.toEqual(['a', 'b']);
        expect(events).toEqual(['start a', 'end a', 'start b', 'end b']);
    });
});
