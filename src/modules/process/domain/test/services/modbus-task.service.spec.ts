import ModbusRTU from 'modbus-serial';
import { ModbusTaskService } from '@process/domain/services/modbus-task.service';
import { ComRequestModel } from '@process/domain/models/com-request.model';
import { DeviceModel, DeviceType, MasterConfigModel, MasterProtocol, SlaveConfigModel } from '@process/domain/models/device.model';

interface MockModbusClient {
    isOpen: boolean;
    connectTCP: jest.Mock;
    connectRTUBuffered: jest.Mock;
    setID: jest.Mock;
    setTimeout: jest.Mock;
    readHoldingRegisters: jest.Mock;
    readCoils: jest.Mock;
    readDiscreteInputs: jest.Mock;
    writeRegister: jest.Mock;
    close: jest.Mock;
}

// ModbusTaskService pilote un vrai equipement Modbus (taches de lecture/ecriture + configuration
// d'onduleur/VFD) : meme precaution que ctrl-actuator.strategy.spec.ts, 'modbus-serial' est
// entierement mocke, aucun test n'ouvre jamais un vrai port serie/TCP.
const mockModbusClients: MockModbusClient[] = [];
function CreateMockClient(overrides: Partial<MockModbusClient> = {}): MockModbusClient {
    const client = {
        isOpen: true,
        connectTCP: jest.fn().mockResolvedValue(undefined),
        connectRTUBuffered: jest.fn().mockResolvedValue(undefined),
        setID: jest.fn(),
        setTimeout: jest.fn(),
        readHoldingRegisters: jest.fn().mockResolvedValue({ data: [0, 0] }),
        readCoils: jest.fn().mockResolvedValue({ data: new Array(8).fill(false) }),
        readDiscreteInputs: jest.fn().mockResolvedValue({ data: new Array(8).fill(false) }),
        writeRegister: jest.fn().mockResolvedValue({ address: 0, value: 0 }),
        close: jest.fn((cb?: () => void) => cb?.()),
        ...overrides
    };
    mockModbusClients.push(client);
    return client;
}
jest.mock('modbus-serial', () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => CreateMockClient())
}));

function CreateModbusTaskModel(configOverrides: Record<string, unknown> = {}): ComRequestModel {
    const task = new ComRequestModel();
    task._id = 'task-1';
    task.deviceId = 'slave-1';
    task.name = 'task';
    task.config = {
        function: 'readHoldingRegisters',
        address: 100,
        params: { length: 2, scale: 1 },
        ...configOverrides
    } as ComRequestModel['config'];
    return task;
}

// Un device MASTER (liaison physique) et un device SLAVE (adresse esclave + reference vers le
// MASTER) remplacent respectivement ModbusConnectionConfigModel et InverterModel : la resolution
// se fait desormais en deux sauts (connectionId de la tache -> SLAVE -> MASTER).
function CreateMasterDeviceModel(overrides: Partial<MasterConfigModel> = {}): DeviceModel {
    const device = new DeviceModel();
    device._id = 'master-1';
    device.name = 'master';
    device.type = DeviceType.MASTER;
    const config = new MasterConfigModel();
    config.protocol = MasterProtocol.TCP;
    config.ipAddress = '192.0.2.1';
    config.port = 502;
    config.path = '/dev/ttyUSB0';
    config.timeout = 2000;
    device.config = Object.assign(config, overrides);
    return device;
}

function CreateSlaveDeviceModel(overrides: Partial<SlaveConfigModel> = {}): DeviceModel {
    const device = new DeviceModel();
    device._id = 'slave-1';
    device.name = 'slave';
    device.type = DeviceType.SLAVE;
    const config = new SlaveConfigModel();
    config.slaveId = '1';
    config.masterDeviceId = 'master-1';
    device.config = Object.assign(config, overrides);
    return device;
}

function CreateLoggerMock(): { log: jest.Mock; debug: jest.Mock; warn: jest.Mock; error: jest.Mock } {
    return { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe('ModbusTaskService (modbus-serial mocked)', () => {
    let modbusTaskRepository: { get: jest.Mock };
    let deviceRepository: { get: jest.Mock };
    let masterDevice: DeviceModel;
    let slaveDevice: DeviceModel;
    let logger: ReturnType<typeof CreateLoggerMock>;
    let service: ModbusTaskService;

    beforeEach(() => {
        mockModbusClients.length = 0;
        masterDevice = CreateMasterDeviceModel();
        slaveDevice = CreateSlaveDeviceModel();
        modbusTaskRepository = { get: jest.fn().mockResolvedValue(CreateModbusTaskModel()) };
        deviceRepository = {
            get: jest.fn((id: string) => Promise.resolve(
                id === masterDevice._id ? masterDevice : id === slaveDevice._id ? slaveDevice : null
            ))
        };
        logger = CreateLoggerMock();

        service = new ModbusTaskService(
            deviceRepository as never,
            modbusTaskRepository as never,
            logger as never
        );
    });

    describe('execute (read/write tasks)', () => {
        it('should read holding registers and decode/log the resulting value', async () => {
            modbusTaskRepository.get.mockResolvedValue(CreateModbusTaskModel({ function: 'readHoldingRegisters', address: 100 }));
            mockModbusClients.length = 0;
            // 1.0f en IEEE754 = 0x3F800000 ; avec wordSwap=true (fixe dans le service), registers = [16256, 0]
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockResolvedValue({ data: [16256, 0] })
            }));

            await service.execute('task-1');

            expect(logger.log).toHaveBeenCalledWith(
                expect.objectContaining({ label: 'task', value: 1 }),
                'modbus read result'
            );
            expect(mockModbusClients[0].close).toHaveBeenCalled();
        });

        it('should throw when a read task returns no data', async () => {
            modbusTaskRepository.get.mockResolvedValue(CreateModbusTaskModel({ function: 'readHoldingRegisters' }));
            mockModbusClients.length = 0;
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockResolvedValue({ data: undefined })
            }));

            await expect(service.execute('task-1')).rejects.toThrow('Aucune donnée reçue');
        });

        it('should write the given value to a write task', async () => {
            modbusTaskRepository.get.mockResolvedValue(CreateModbusTaskModel({ function: 'writeRegister', address: 50 }));
            mockModbusClients.length = 0;
            const writeRegister = jest.fn().mockResolvedValue({ address: 50, value: 42 });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({ writeRegister }));

            await service.execute('task-1', { value: 42 });

            expect(writeRegister).toHaveBeenCalledWith(50, 42);
            expect(logger.log).toHaveBeenCalledWith(expect.objectContaining({ value: 42 }), 'modbus write done');
        });

        it('should throw when a write task is called without a value', async () => {
            modbusTaskRepository.get.mockResolvedValue(CreateModbusTaskModel({ function: 'writeRegister' }));

            await expect(service.execute('task-1', {} as { value: number })).rejects.toThrow('Aucune valeur spécifiée pour l\'écriture');
        });

        it('should throw when the client has no matching function at all', async () => {
            modbusTaskRepository.get.mockResolvedValue(CreateModbusTaskModel({ function: 'doSomethingElse' }));

            await expect(service.execute('task-1')).rejects.toThrow('Fonction Modbus inconnue: doSomethingElse');
        });

        it('should throw for a client function that is neither a read nor a write', async () => {
            modbusTaskRepository.get.mockResolvedValue(CreateModbusTaskModel({ function: 'pingModule' }));
            mockModbusClients.length = 0;
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                pingModule: jest.fn().mockResolvedValue(undefined)
            } as never));

            await expect(service.execute('task-1')).rejects.toThrow('Type de fonction non supporté: pingModule');
        });

        it('should throw when the number of decoded registers does not match the requested length', async () => {
            modbusTaskRepository.get.mockResolvedValue(CreateModbusTaskModel({ function: 'readHoldingRegisters', params: { length: 2 } }));
            mockModbusClients.length = 0;
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockResolvedValue({ data: [0] })
            }));

            await expect(service.execute('task-1')).rejects.toThrow('ne correspond pas au length');
        });

        it('should log an error but continue when execute is called without a taskId', async () => {
            await expect(service.execute('')).resolves.toBeUndefined();

            expect(logger.error).toHaveBeenCalledWith('modbus execute called without taskId');
        });

        it('should log an error and stop when no slave device is found for the task', async () => {
            deviceRepository.get.mockResolvedValue(null);

            await expect(service.execute('task-1')).resolves.toBeUndefined();

            expect(logger.error).toHaveBeenCalledWith({ slaveDeviceId: 'slave-1' }, 'no slave device found');
        });

        it('should log an error and stop when no master device is found for the slave', async () => {
            deviceRepository.get.mockImplementation((id: string) => Promise.resolve(id === slaveDevice._id ? slaveDevice : null));

            await expect(service.execute('task-1')).resolves.toBeUndefined();

            expect(logger.error).toHaveBeenCalledWith({ masterDeviceId: 'master-1' }, 'no master device found');
        });

        it('should connect over RTU when the connection protocol is rtu', async () => {
            masterDevice.config = Object.assign(new MasterConfigModel(), { protocol: MasterProtocol.RTU, path: '/dev/ttyUSB3', baudRate: 19200 });
            mockModbusClients.length = 0;
            const connectRTUBuffered = jest.fn().mockResolvedValue(undefined);
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({ connectRTUBuffered }));

            await service.execute('task-1');

            expect(connectRTUBuffered).toHaveBeenCalledWith('/dev/ttyUSB3', expect.objectContaining({ baudRate: 19200 }));
        });

        it('should reject for an unknown connection protocol', async () => {
            masterDevice.config = Object.assign(new MasterConfigModel(), { protocol: 'foo' });

            await expect(service.execute('task-1')).rejects.toThrow('Protocole inconnu: foo');
        });

        it('should reject when the task or connection lookup fails (invalid taskId)', async () => {
            modbusTaskRepository.get.mockResolvedValue(null);

            await expect(service.execute('missing-task')).rejects.toThrow();
            expect(logger.error).toHaveBeenCalledWith({ taskId: 'missing-task' }, 'no modbus task found for taskId');
        });

        it('should swallow a network-related error instead of rejecting', async () => {
            mockModbusClients.length = 0;
            const networkError = Object.assign(new Error('unreachable'), { code: 'ECONNREFUSED' });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockRejectedValue(networkError)
            }));

            await expect(service.execute('task-1')).resolves.toBeUndefined();
        });

        it('should swallow a modbus-protocol-coded error instead of rejecting', async () => {
            mockModbusClients.length = 0;
            const modbusError = Object.assign(new Error('illegal address'), { modbusCode: 2 });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockRejectedValue(modbusError)
            }));

            await expect(service.execute('task-1')).resolves.toBeUndefined();
        });

        it('should reject an unexpected error that is neither network nor modbus-coded', async () => {
            mockModbusClients.length = 0;
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockRejectedValue(new Error('boom'))
            }));

            await expect(service.execute('task-1')).rejects.toThrow('boom');
        });

        it('should process queued calls sequentially and resolve all of them', async () => {
            const results = await Promise.all([service.execute('task-1'), service.execute('task-1'), service.execute('task-1')]);

            expect(results).toEqual([undefined, undefined, undefined]);
            expect(mockModbusClients).toHaveLength(3);
        });

        it('should be a no-op to (re-)trigger the queue processing while it is already running', async () => {
            (service as unknown as { _isProcessing: boolean })._isProcessing = true;

            await expect((service as unknown as { _processQueue: () => Promise<void> })._processQueue()).resolves.toBeUndefined();
        });
    });

    describe('applyInverterConfig', () => {
        it('should connect over RTU when the connection protocol is rtu', async () => {
            masterDevice.config = Object.assign(new MasterConfigModel(), { protocol: MasterProtocol.RTU, path: '/dev/ttyUSB3', baudRate: 19200 });
            mockModbusClients.length = 0;
            const connectRTUBuffered = jest.fn().mockResolvedValue(undefined);
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({ connectRTUBuffered }));

            await service.applyInverterConfig('slave-1', [{ param: 'F00.11', value: 1 }]);

            expect(connectRTUBuffered).toHaveBeenCalledWith('/dev/ttyUSB3', expect.objectContaining({ baudRate: 19200 }));
        });

        it('should write each parameter using its resolved address (group/item formula)', async () => {
            mockModbusClients.length = 0;
            const writeRegister = jest.fn().mockResolvedValue({ address: 0, value: 0 });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({ writeRegister }));

            await service.applyInverterConfig('slave-1', [{ param: 'F00.11', value: 4200 }]);

            expect(writeRegister).toHaveBeenCalledWith(0 * 256 + 11, 4200);
        });

        it('should write to the EEPROM-offset address when persist is true', async () => {
            mockModbusClients.length = 0;
            const writeRegister = jest.fn().mockResolvedValue({ address: 0, value: 0 });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({ writeRegister }));

            await service.applyInverterConfig('slave-1', [{ param: 'F00.11', value: 100, persist: true }]);

            expect(writeRegister).toHaveBeenCalledWith(11 + 0x1000, 100);
        });

        it('should resolve the address from the F-group/item numbering', async () => {
            mockModbusClients.length = 0;
            const writeRegister = jest.fn().mockResolvedValue({ address: 0, value: 0 });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({ writeRegister }));

            await service.applyInverterConfig('slave-1', [{ param: 'F11.09', value: 300 }]);

            expect(writeRegister).toHaveBeenCalledWith(11 * 256 + 9, 300);
        });

        it('should log a warning and skip a malformed parameter name', async () => {
            await service.applyInverterConfig('slave-1', [{ param: 'not-a-param', value: 1 }]);

            expect(logger.warn).toHaveBeenCalledWith({ param: 'not-a-param' }, 'unknown parameter format, skipping');
        });

        it('should log and return early when the slave device is not found', async () => {
            deviceRepository.get.mockResolvedValue(null);

            await expect(service.applyInverterConfig('missing-device', [])).resolves.toBeUndefined();
            expect(logger.error).toHaveBeenCalledWith({ slaveDeviceId: 'missing-device' }, 'no slave device found');
        });

        it('should reject for an unknown connection protocol', async () => {
            masterDevice.config = Object.assign(new MasterConfigModel(), { protocol: 'foo' });

            await expect(service.applyInverterConfig('slave-1', [{ param: 'F00.11', value: 1 }])).rejects.toThrow('Unknown protocol: foo');
        });

        it('should swallow a network-related error instead of rejecting', async () => {
            mockModbusClients.length = 0;
            const networkError = Object.assign(new Error('unreachable'), { code: 'ETIMEDOUT' });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                writeRegister: jest.fn().mockRejectedValue(networkError)
            }));

            await expect(service.applyInverterConfig('slave-1', [{ param: 'F00.11', value: 1 }])).resolves.toBeUndefined();
        });

        it('should always close the modbus connection, even after an error', async () => {
            mockModbusClients.length = 0;
            const close = jest.fn((cb?: () => void) => cb?.());
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                writeRegister: jest.fn().mockRejectedValue(new Error('boom')),
                close
            }));

            await expect(service.applyInverterConfig('slave-1', [{ param: 'F00.11', value: 1 }])).rejects.toThrow('boom');

            expect(close).toHaveBeenCalled();
        });
    });

    // Regression tests for the "Data length error, expected X got Y" / timeouts seen when
    // monitorDigitalOutputs polls the same physical bus as an actuator command: every Modbus
    // operation (queued task, testExecuteTask, monitor poll) must now go through the same
    // internal queue so no two transactions are ever in flight on the wire at once.
    describe('operation ordering (monitor polls, testExecuteTask and execute never overlap)', () => {
        function FlushMicrotasks(): Promise<void> {
            return new Promise((resolve) => setImmediate(resolve));
        }

        it('should run testExecuteTask only after a previously queued execute() call has completed', async () => {
            mockModbusClients.length = 0;
            const order: string[] = [];
            let resolveFirstRead!: (value: { data: number[] }) => void;
            const firstReadPromise = new Promise<{ data: number[] }>((resolve) => { resolveFirstRead = resolve; });

            (ModbusRTU as unknown as jest.Mock)
                .mockImplementationOnce(() => CreateMockClient({
                    readHoldingRegisters: jest.fn(() => {
                        order.push('execute-start');
                        return firstReadPromise.then((data) => { order.push('execute-end'); return data; });
                    })
                }))
                .mockImplementationOnce(() => CreateMockClient({
                    readHoldingRegisters: jest.fn(() => {
                        order.push('test-start');
                        return Promise.resolve({ data: [0, 0] });
                    })
                }));

            const executeCall = service.execute('task-1');
            await FlushMicrotasks();
            expect(order).toEqual(['execute-start']);

            const testExecuteCall = service.testExecuteTask(CreateModbusTaskModel());
            await FlushMicrotasks();
            // testExecuteTask must still be waiting behind the in-flight execute() call.
            expect(order).toEqual(['execute-start']);

            resolveFirstRead({ data: [0, 0] });
            await Promise.all([executeCall, testExecuteCall]);

            expect(order).toEqual(['execute-start', 'execute-end', 'test-start']);
        });

        it('should serialize monitorDigitalOutputs polls behind actuator execute() calls on the same bus', async () => {
            mockModbusClients.length = 0;
            const order: string[] = [];
            let resolveReadCoils!: (value: { data: boolean[] }) => void;
            const readCoilsPromise = new Promise<{ data: boolean[] }>((resolve) => { resolveReadCoils = resolve; });

            (ModbusRTU as unknown as jest.Mock)
                .mockImplementationOnce(() => CreateMockClient({
                    readCoils: jest.fn(() => {
                        order.push('poll-start');
                        return readCoilsPromise.then((data) => { order.push('poll-end'); return data; });
                    })
                }))
                .mockImplementationOnce(() => CreateMockClient({
                    readHoldingRegisters: jest.fn(() => {
                        order.push('execute-start');
                        return Promise.resolve({ data: [0, 0] });
                    })
                }));

            const monitorPromise = service.monitorDigitalOutputs('slave-1', 100000, 8);
            await FlushMicrotasks();
            expect(order).toEqual(['poll-start']);

            const executeCall = service.execute('task-1');
            await FlushMicrotasks();
            // execute() must wait for the monitor's in-flight readCoils, not race it.
            expect(order).toEqual(['poll-start']);

            resolveReadCoils({ data: new Array(8).fill(false) });
            const handle = await monitorPromise;
            await executeCall;
            await handle.stop();

            expect(order).toEqual(['poll-start', 'poll-end', 'execute-start']);
        });

        it('should serialize monitorDigitalInputs polls behind actuator execute() calls on the same bus', async () => {
            mockModbusClients.length = 0;
            const order: string[] = [];
            let resolveReadDiscreteInputs!: (value: { data: boolean[] }) => void;
            const readPromise = new Promise<{ data: boolean[] }>((resolve) => { resolveReadDiscreteInputs = resolve; });

            (ModbusRTU as unknown as jest.Mock)
                .mockImplementationOnce(() => CreateMockClient({
                    readDiscreteInputs: jest.fn(() => {
                        order.push('poll-start');
                        return readPromise.then((data) => { order.push('poll-end'); return data; });
                    })
                }))
                .mockImplementationOnce(() => CreateMockClient({
                    readHoldingRegisters: jest.fn(() => {
                        order.push('execute-start');
                        return Promise.resolve({ data: [0, 0] });
                    })
                }));

            const monitorPromise = service.monitorDigitalInputs('slave-1', 100000, 8, 5000);
            await FlushMicrotasks();
            expect(order).toEqual(['poll-start']);

            const executeCall = service.execute('task-1');
            await FlushMicrotasks();
            expect(order).toEqual(['poll-start']);

            resolveReadDiscreteInputs({ data: new Array(8).fill(false) });
            const handle = await monitorPromise;
            await executeCall;
            await handle.stop();

            expect(order).toEqual(['poll-start', 'poll-end', 'execute-start']);
        });
    });

    describe('monitorDigitalOutputs (state change callback)', () => {
        it('should invoke onChange with only the channels that changed state', async () => {
            mockModbusClients.length = 0;
            const pollResults = [new Array(8).fill(false), new Array(8).fill(false).map((_, i) => i === 2)];
            let callIndex = 0;
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readCoils: jest.fn(() => Promise.resolve({ data: pollResults[Math.min(callIndex++, pollResults.length - 1)] }))
            }));

            const onChange = jest.fn();
            const handle = await service.monitorDigitalOutputs('slave-1', 10, 8, onChange);

            await new Promise((resolve) => setTimeout(resolve, 50));
            await handle.stop();

            expect(onChange).toHaveBeenCalledWith([{ channel: 2, previous: false, current: true }]);
        });

        it('should not invoke onChange when no channel changes state', async () => {
            mockModbusClients.length = 0;
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readCoils: jest.fn().mockResolvedValue({ data: new Array(8).fill(false) })
            }));

            const onChange = jest.fn();
            const handle = await service.monitorDigitalOutputs('slave-1', 10, 8, onChange);

            await new Promise((resolve) => setTimeout(resolve, 50));
            await handle.stop();

            expect(onChange).not.toHaveBeenCalled();
        });
    });
});
