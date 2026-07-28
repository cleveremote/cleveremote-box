import ModbusRTU from 'modbus-serial';
import { BadRequestException } from '@nestjs/common';
import { ModbusService } from '@process/domain/services/modbus.service';
import { ComRequestConfigModel, ComRequestModel, ModbusValueType } from '@process/domain/models/com-request.model';
import { DeviceKind, DeviceModel, DeviceType, MasterConfigModel, MasterProtocol, SlaveConfigModel } from '@process/domain/models/device.model';
import { AO8CH_DEVICE_ADDRESS_REGISTER, DEFAULT_UNCONFIGURED_UNIT_ID } from '@process/domain/utils/modbus-registers.util';

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
    writeRegisters: jest.Mock;
    close: jest.Mock;
}

// ModbusService pilote un vrai equipement Modbus (taches de lecture/ecriture + configuration
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
        writeRegisters: jest.fn().mockResolvedValue({ address: 0, length: 0 }),
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
        function: ['readHoldingRegisters'],
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
    config.slaveId = 1;
    config.masterDeviceId = 'master-1';
    device.config = Object.assign(config, overrides);
    return device;
}

function CreateLoggerMock(): { log: jest.Mock; debug: jest.Mock; warn: jest.Mock; error: jest.Mock } {
    return { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe('ModbusService (modbus-serial mocked)', () => {
    let modbusTaskRepository: { get: jest.Mock };
    let deviceRepository: { get: jest.Mock; getByType: jest.Mock; save: jest.Mock };
    let masterDevice: DeviceModel;
    let slaveDevice: DeviceModel;
    let logger: ReturnType<typeof CreateLoggerMock>;
    let service: ModbusService;

    beforeEach(() => {
        mockModbusClients.length = 0;
        masterDevice = CreateMasterDeviceModel();
        slaveDevice = CreateSlaveDeviceModel();
        modbusTaskRepository = { get: jest.fn() };
        deviceRepository = {
            get: jest.fn((id: string) => Promise.resolve(
                id === masterDevice._id ? masterDevice : id === slaveDevice._id ? slaveDevice : null
            )),
            getByType: jest.fn().mockResolvedValue([]),
            save: jest.fn()
        };
        logger = CreateLoggerMock();

        service = new ModbusService(
            deviceRepository as never,
            modbusTaskRepository as never,
            logger as never
        );
    });

    describe('execute (read/write com requests)', () => {
        it('should read holding registers and decode/log the resulting value', async () => {
            mockModbusClients.length = 0;
            // 1.0f en IEEE754 = 0x3F800000 ; avec wordSwap=true (fixe dans le service), registers = [16256, 0]
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockResolvedValue({ data: [16256, 0] })
            }));

            await service.execute(CreateModbusTaskModel({ function: ['readHoldingRegisters'], address: 100 }));

            expect(logger.log).toHaveBeenCalledWith(
                expect.objectContaining({ label: 'task', value: 1 }),
                'modbus read result'
            );
            expect(mockModbusClients[0].close).toHaveBeenCalled();
        });

        it('should leave result.evaluated undefined for a com request without config.type (backward compatibility)', async () => {
            mockModbusClients.length = 0;
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockResolvedValue({ data: [16256, 0] })
            }));

            const result = await service.execute(CreateModbusTaskModel({ function: ['readHoldingRegisters'], address: 100 }));

            expect((result as { result: { evaluated?: unknown } }).result.evaluated).toBeUndefined();
        });

        it('should decode an int-type field and evaluate its formula', async () => {
            mockModbusClients.length = 0;
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockResolvedValue({ data: [21] })
            }));

            const result = await service.execute(CreateModbusTaskModel({
                function: ['readHoldingRegisters'], address: 95, type: ModbusValueType.INT,
                params: { length: 1, formula: 'raw * 2' }
            }));

            expect((result as { result: { evaluated: { value: number } } }).result.evaluated.value).toEqual(42);
        });

        it('should decode a float-type field and evaluate its formula', async () => {
            mockModbusClients.length = 0;
            // 1.0f en IEEE754 = 0x3F800000, mot haut/bas inversés (cf. ModbusService._toFloat)
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockResolvedValue({ data: [0, 16256] })
            }));

            const result = await service.execute(CreateModbusTaskModel({
                function: ['readHoldingRegisters'], address: 1, type: ModbusValueType.FLOAT,
                params: { length: 2, formula: 'raw' }
            }));

            expect((result as { result: { evaluated: { value: number } } }).result.evaluated.value).toEqual(1);
        });

        it('should decode a uint32-type field and evaluate its formula', async () => {
            mockModbusClients.length = 0;
            // 70000 = 0x00011170, mot haut/bas inversés (cf. ModbusService._toUint32)
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockResolvedValue({ data: [4464, 1] })
            }));

            const result = await service.execute(CreateModbusTaskModel({
                function: ['readHoldingRegisters'], address: 105, type: ModbusValueType.UINT32,
                params: { length: 2, formula: 'raw' }
            }));

            expect((result as { result: { evaluated: { value: number } } }).result.evaluated.value).toEqual(70000);
        });

        it('should decode a cumulative-type field (LONG + IEEE754 fraction) reading REG1439 for the decimal position', async () => {
            mockModbusClients.length = 0;
            const readHoldingRegisters = jest.fn()
                // N=1234 (LONG), Nf=0.5 (IEEE754) - mots haut/bas inversés (cf. ModbusService._toLong/_toFloat)
                .mockResolvedValueOnce({ data: [1234, 0, 0, 16128] })
                // REG1439 (position décimale) = 3
                .mockResolvedValueOnce({ data: [3] });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({ readHoldingRegisters }));

            const result = await service.execute(CreateModbusTaskModel({
                function: ['readHoldingRegisters'], address: 9, type: ModbusValueType.CUMULATIVE,
                params: { length: 4, formula: '(N + Nf) * 10^(n - 3)' }
            })) as { result: { evaluated: { scope: Record<string, number>; value: number } } };

            expect(result.result.evaluated.scope).toEqual({ N: 1234, Nf: 0.5, n: 3 });
            expect(result.result.evaluated.value).toEqual(1234.5);
            expect(readHoldingRegisters).toHaveBeenCalledWith(1438, 1);
        });

        it('should cache the decimal position per device across successive cumulative reads', async () => {
            mockModbusClients.length = 0;
            const readHoldingRegisters = jest.fn()
                .mockResolvedValueOnce({ data: [1234, 0, 0, 16128] })
                .mockResolvedValueOnce({ data: [3] })
                .mockResolvedValueOnce({ data: [1234, 0, 0, 16128] });
            // Un nouveau client est ouvert par service.execute() (cf. _runComRequest) : deux appels
            // -> deux mockImplementationOnce, partageant le même mock readHoldingRegisters pour
            // observer le nombre total de lectures REG1439 sur les deux connexions.
            (ModbusRTU as unknown as jest.Mock)
                .mockImplementationOnce(() => CreateMockClient({ readHoldingRegisters }))
                .mockImplementationOnce(() => CreateMockClient({ readHoldingRegisters }));

            const cumulativeTask = CreateModbusTaskModel({
                function: ['readHoldingRegisters'], address: 9, type: ModbusValueType.CUMULATIVE,
                params: { length: 4, formula: '(N + Nf) * 10^(n - 3)' }
            });

            await service.execute(cumulativeTask);
            await service.execute(cumulativeTask);

            const decimalPositionCalls = readHoldingRegisters.mock.calls.filter(([addr]) => addr === 1438);
            expect(decimalPositionCalls).toHaveLength(1);
        });

        it('should throw when a read task returns no data', async () => {
            mockModbusClients.length = 0;
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockResolvedValue({ data: undefined })
            }));

            await expect(service.execute(CreateModbusTaskModel({ function: ['readHoldingRegisters'] }))).rejects.toThrow('Aucune donnée reçue');
        });

        it('should write the given value to a write com request', async () => {
            mockModbusClients.length = 0;
            const writeRegister = jest.fn().mockResolvedValue({ address: 50, value: 42 });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({ writeRegister }));
            const param: ComRequestConfigModel = { address: 50, function: [], params: { value: 42 } };

            await service.execute(CreateModbusTaskModel({ function: ['writeRegister'], address: 50 }), param);

            expect(writeRegister).toHaveBeenCalledWith(50, 42);
            expect(logger.log).toHaveBeenCalledWith(expect.objectContaining({ value: 42 }), 'modbus write done');
        });

        it('should throw when no configured function is known to the client', async () => {
            await expect(service.execute(CreateModbusTaskModel({ function: ['readSomethingElse'] }))).rejects.toThrow('Fonction Modbus inconnue: readSomethingElse');
        });

        it('should throw when no configured function matches the requested read/write direction', async () => {
            await expect(service.execute(CreateModbusTaskModel({ function: ['pingModule'] }))).rejects.toThrow('Aucune fonction Modbus de lecture configurée pour cette tâche');
        });

        it('should pick the write function from a com request configured with both a read and a write function', async () => {
            mockModbusClients.length = 0;
            const writeRegister = jest.fn().mockResolvedValue({ address: 50, value: 42 });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({ writeRegister }));
            const param: ComRequestConfigModel = { address: 50, function: [], params: { value: 42 } };

            await service.execute(CreateModbusTaskModel({ function: ['readCoils', 'writeRegister'], address: 50 }), param);

            expect(writeRegister).toHaveBeenCalledWith(50, 42);
        });

        it('should route an array value to writeRegisters instead of writeRegister', async () => {
            mockModbusClients.length = 0;
            const writeRegisters = jest.fn().mockResolvedValue({ address: 50, length: 2 });
            const writeRegister = jest.fn().mockResolvedValue({ address: 50, value: 42 });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({ writeRegisters, writeRegister }));
            const param: ComRequestConfigModel = { address: 50, function: [], params: { value: [1, 2] } };

            await service.execute(CreateModbusTaskModel({ function: ['writeRegister', 'writeRegisters'], address: 50 }), param);

            expect(writeRegisters).toHaveBeenCalledWith(50, [1, 2]);
            expect(writeRegister).not.toHaveBeenCalled();
            expect(logger.log).toHaveBeenCalledWith(expect.objectContaining({ value: [1, 2] }), 'modbus write done');
        });

        it('should fall back to the only configured write function when an array value has no matching multi-write function', async () => {
            mockModbusClients.length = 0;
            const writeRegister = jest.fn().mockResolvedValue({ address: 50, value: 0 });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({ writeRegister }));
            const param: ComRequestConfigModel = { address: 50, function: [], params: { value: [1, 2] } };

            await service.execute(CreateModbusTaskModel({ function: ['writeRegister'], address: 50 }), param);

            expect(writeRegister).toHaveBeenCalledWith(50, [1, 2]);
        });

        it('should throw when the number of decoded registers does not match the requested length', async () => {
            mockModbusClients.length = 0;
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockResolvedValue({ data: [0] })
            }));

            await expect(service.execute(CreateModbusTaskModel({ function: ['readHoldingRegisters'], params: { length: 2 } }))).rejects.toThrow('ne correspond pas au length');
        });

        it('should log the raw boolean array for a readCoils com request instead of decoding it as floats', async () => {
            mockModbusClients.length = 0;
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readCoils: jest.fn().mockResolvedValue({ data: [true, false] })
            }));

            await service.execute(CreateModbusTaskModel({ function: ['readCoils'], address: 0, params: { length: 2 } }));

            expect(logger.log).toHaveBeenCalledWith(
                expect.objectContaining({ label: 'task', value: [true, false] }),
                'modbus read result'
            );
        });

        it('should write to the persistence-offset address when param.params.persistence.persist is true', async () => {
            mockModbusClients.length = 0;
            const writeRegister = jest.fn().mockResolvedValue({ address: 0, value: 0 });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({ writeRegister }));
            const param: ComRequestConfigModel = { address: 50, function: [], params: { value: 42, persistence: { persist: true, address: 10 } } };

            await service.execute(CreateModbusTaskModel({ function: ['writeRegister'], address: 50 }), param);

            expect(writeRegister).toHaveBeenCalledWith(60, 42);
        });

        it('should log an error and reject when execute is called without a comRequest', async () => {
            await expect(service.execute(undefined as unknown as ComRequestModel)).rejects.toThrow();

            expect(logger.error).toHaveBeenCalledWith('modbus execute called without comRequest');
        });

        it('should log an error and stop when no slave device is found for the com request', async () => {
            deviceRepository.get.mockResolvedValue(null);

            await expect(service.execute(CreateModbusTaskModel())).resolves.toBeUndefined();

            expect(logger.error).toHaveBeenCalledWith({ slaveDeviceId: 'slave-1' }, 'no slave device found');
        });

        it('should log an error and stop when no master device is found for the slave', async () => {
            deviceRepository.get.mockImplementation((id: string) => Promise.resolve(id === slaveDevice._id ? slaveDevice : null));

            await expect(service.execute(CreateModbusTaskModel())).resolves.toBeUndefined();

            expect(logger.error).toHaveBeenCalledWith({ masterDeviceId: 'master-1' }, 'no master device found');
        });

        it('should connect over RTU when the connection protocol is rtu', async () => {
            masterDevice.config = Object.assign(new MasterConfigModel(), { protocol: MasterProtocol.RTU, path: '/dev/ttyUSB3', baudRate: 19200 });
            mockModbusClients.length = 0;
            const connectRTUBuffered = jest.fn().mockResolvedValue(undefined);
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({ connectRTUBuffered }));

            await service.execute(CreateModbusTaskModel());

            expect(connectRTUBuffered).toHaveBeenCalledWith('/dev/ttyUSB3', expect.objectContaining({ baudRate: 19200 }));
        });

        it('should reject for an unknown connection protocol', async () => {
            masterDevice.config = Object.assign(new MasterConfigModel(), { protocol: 'foo' });

            await expect(service.execute(CreateModbusTaskModel())).rejects.toThrow('Protocole inconnu: foo');
        });

        it('should swallow a network-related error instead of rejecting', async () => {
            mockModbusClients.length = 0;
            const networkError = Object.assign(new Error('unreachable'), { code: 'ECONNREFUSED' });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockRejectedValue(networkError)
            }));

            await expect(service.execute(CreateModbusTaskModel())).resolves.toBeUndefined();
        });

        it('should swallow a modbus-protocol-coded error instead of rejecting', async () => {
            mockModbusClients.length = 0;
            const modbusError = Object.assign(new Error('illegal address'), { modbusCode: 2 });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockRejectedValue(modbusError)
            }));

            await expect(service.execute(CreateModbusTaskModel())).resolves.toBeUndefined();
        });

        it('should reject an unexpected error that is neither network nor modbus-coded', async () => {
            mockModbusClients.length = 0;
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockRejectedValue(new Error('boom'))
            }));

            await expect(service.execute(CreateModbusTaskModel())).rejects.toThrow('boom');
        });

        it('should process queued calls sequentially and resolve all of them', async () => {
            const results = await Promise.all([
                service.execute(CreateModbusTaskModel()),
                service.execute(CreateModbusTaskModel()),
                service.execute(CreateModbusTaskModel())
            ]);

            const expectedResult = { function: 'readHoldingRegisters', result: { data: [0, 0] } };
            expect(results).toEqual([expectedResult, expectedResult, expectedResult]);
            expect(mockModbusClients).toHaveLength(3);
        });

        it('should be a no-op to (re-)trigger the queue processing while it is already running', async () => {
            (service as unknown as { _isProcessing: boolean })._isProcessing = true;

            await expect((service as unknown as { _processQueue: () => Promise<void> })._processQueue()).resolves.toBeUndefined();
        });

        it('should default the read length and formula from config.type when params.length/formula are omitted', async () => {
            mockModbusClients.length = 0;
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockResolvedValue({ data: [21] })
            }));

            const result = await service.execute(CreateModbusTaskModel({
                function: ['readHoldingRegisters'], address: 95, type: ModbusValueType.INT, params: {}
            })) as { result: { evaluated: { formula: string; scope: Record<string, number>; value: number } } };

            expect(mockModbusClients[0].readHoldingRegisters).toHaveBeenCalledWith(95, 1);
            expect(result.result.evaluated).toEqual({ formula: 'raw', scope: { raw: 21 }, value: 21 });
        });

        it('should reject with a BadRequestException when config.params.formula is not valid mathjs syntax', async () => {
            mockModbusClients.length = 0;
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockResolvedValue({ data: [21] })
            }));

            await expect(service.execute(CreateModbusTaskModel({
                function: ['readHoldingRegisters'], address: 95, type: ModbusValueType.INT,
                params: { length: 1, formula: 'raw +' }
            }))).rejects.toThrow(/Formule invalide/);
        });

        it('should reject with a BadRequestException when a formula references a variable missing from the decoded scope', async () => {
            mockModbusClients.length = 0;
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockResolvedValue({ data: [21] })
            }));

            await expect(service.execute(CreateModbusTaskModel({
                function: ['readHoldingRegisters'], address: 95, type: ModbusValueType.INT,
                params: { length: 1, formula: 'raw + foo' }
            }))).rejects.toThrow(/variables manquantes/);
        });
    });

    describe('evaluateScale (formula compilation and sandboxing)', () => {
        it('should evaluate a formula against the given scope', () => {
            expect(service.evaluateScale('raw * 2 + offset', { raw: 10, offset: 1 })).toEqual(21);
        });

        it('should reuse the compiled formula cache on repeated calls with the same expression', () => {
            expect(service.evaluateScale('raw + 1', { raw: 1 })).toEqual(2);
            expect(service.evaluateScale('raw + 1', { raw: 5 })).toEqual(6);
        });

        it('should throw a BadRequestException for a syntactically invalid formula', () => {
            expect(() => service.evaluateScale('raw +', {})).toThrow(BadRequestException);
            expect(() => service.evaluateScale('raw +', {})).toThrow(/Formule invalide/);
        });

        it.each([
            ['import("x")'],
            ['createUnit("foo")'],
            ['evaluate("1+1")'],
            ['parse("1+1")']
        ])('should throw when a formula tries to reach the disabled mathjs function %s', (expr) => {
            expect(() => service.evaluateScale(expr, {})).toThrow('désactivé');
        });
    });

    describe('refreshDecimalPosition', () => {
        it('should clear the cached decimal position for the device and re-read REG1439', async () => {
            mockModbusClients.length = 0;
            const readHoldingRegisters = jest.fn().mockResolvedValue({ data: [3] });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({ readHoldingRegisters }));

            const result = await service.refreshDecimalPosition('slave-1');

            expect(readHoldingRegisters).toHaveBeenCalledWith(1438, 1);
            expect(result).toEqual(3);
            expect(mockModbusClients[0].close).toHaveBeenCalled();
        });

        it('should throw when no device is found for the given deviceId', async () => {
            deviceRepository.get.mockResolvedValue(null);

            await expect(service.refreshDecimalPosition('unknown')).rejects.toThrow('no device found');
        });
    });

    describe('testCommunication', () => {
        it('should return ok:true when REG0361 reads back ~361.0', async () => {
            mockModbusClients.length = 0;
            // 361.0f en IEEE754BE = mots [32768, 17332] (mots haut/bas inversés, cf. _toFloat)
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockResolvedValue({ data: [32768, 17332] })
            }));

            const result = await service.testCommunication('slave-1');

            expect(result).toEqual({ value: 361, ok: true });
        });

        it('should return ok:false when REG0361 does not read back 361.0', async () => {
            mockModbusClients.length = 0;
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockResolvedValue({ data: [0, 0] })
            }));

            const result = await service.testCommunication('slave-1');

            expect(result).toEqual({ value: 0, ok: false });
        });

        it('should throw when no device is found for the given deviceId', async () => {
            deviceRepository.get.mockResolvedValue(null);

            await expect(service.testCommunication('unknown')).rejects.toThrow('no device found');
        });
    });

    describe('changeSlaveAddress', () => {
        it('should reject an out-of-range address without touching the device repository', async () => {
            await expect(service.changeSlaveAddress('slave-1', 0)).rejects.toThrow(BadRequestException);
            await expect(service.changeSlaveAddress('slave-1', 256)).rejects.toThrow(BadRequestException);
            expect(deviceRepository.get).not.toHaveBeenCalled();
        });

        it('should write the new address, reassign the client unit id, then confirm communication', async () => {
            mockModbusClients.length = 0;
            const writeRegister = jest.fn().mockResolvedValue({ address: 61, value: 5 });
            const setID = jest.fn();
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                writeRegister, setID, readHoldingRegisters: jest.fn().mockResolvedValue({ data: [32768, 17332] })
            }));

            const result = await service.changeSlaveAddress('slave-1', 5);

            expect(writeRegister).toHaveBeenCalledWith(61, 5);
            expect(setID).toHaveBeenCalledWith(5);
            expect(result).toBe(true);
            expect(logger.log).toHaveBeenCalledWith({ deviceId: 'slave-1', newAddress: 5, ok: true }, 'slave address changed');
        });

        it('should throw when no device is found for the given deviceId', async () => {
            deviceRepository.get.mockResolvedValue(null);

            await expect(service.changeSlaveAddress('unknown', 5)).rejects.toThrow('no device found');
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
    // operation (queued execute() call, monitor poll) must now go through the same internal
    // queue so no two transactions are ever in flight on the wire at once.
    describe('operation ordering (monitor polls and execute never overlap)', () => {
        function FlushMicrotasks(): Promise<void> {
            return new Promise((resolve) => setImmediate(resolve));
        }

        it('should run a second execute() call only after a previously queued one has completed', async () => {
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
                        order.push('second-start');
                        return Promise.resolve({ data: [0, 0] });
                    })
                }));

            const firstCall = service.execute(CreateModbusTaskModel());
            await FlushMicrotasks();
            expect(order).toEqual(['execute-start']);

            const secondCall = service.execute(CreateModbusTaskModel());
            await FlushMicrotasks();
            // The second execute() must still be waiting behind the in-flight first one.
            expect(order).toEqual(['execute-start']);

            resolveFirstRead({ data: [0, 0] });
            await Promise.all([firstCall, secondCall]);

            expect(order).toEqual(['execute-start', 'execute-end', 'second-start']);
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

            const executeCall = service.execute(CreateModbusTaskModel());
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

            const executeCall = service.execute(CreateModbusTaskModel());
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

        it('should not throw when onChange is omitted and a channel changes state', async () => {
            mockModbusClients.length = 0;
            const pollResults = [new Array(8).fill(false), new Array(8).fill(false).map((_, i) => i === 1)];
            let callIndex = 0;
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readCoils: jest.fn(() => Promise.resolve({ data: pollResults[Math.min(callIndex++, pollResults.length - 1)] }))
            }));

            const handle = await service.monitorDigitalOutputs('slave-1', 10, 8);

            await new Promise((resolve) => setTimeout(resolve, 50));
            await expect(handle.stop()).resolves.toBeUndefined();
        });

        it('should reject when no device is found for the deviceId', async () => {
            deviceRepository.get.mockResolvedValue(null);

            await expect(service.monitorDigitalOutputs('missing-device', 10, 8))
                .rejects.toThrow('monitorDigitalOutputs: no device found for deviceId "missing-device"');
        });

        it('should connect over RTU when the connection protocol is rtu', async () => {
            masterDevice.config = Object.assign(new MasterConfigModel(), { protocol: MasterProtocol.RTU, path: '/dev/ttyUSB5', baudRate: 19200 });
            mockModbusClients.length = 0;
            const connectRTUBuffered = jest.fn().mockResolvedValue(undefined);
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({ connectRTUBuffered }));

            const handle = await service.monitorDigitalOutputs('slave-1', 100000, 8);
            await handle.stop();

            expect(connectRTUBuffered).toHaveBeenCalledWith('/dev/ttyUSB5', expect.objectContaining({ baudRate: 19200 }));
        });

        it('should reject for an unknown connection protocol', async () => {
            masterDevice.config = Object.assign(new MasterConfigModel(), { protocol: 'foo' });

            await expect(service.monitorDigitalOutputs('slave-1', 100000, 8)).rejects.toThrow('Protocole inconnu: foo');
        });

        it('should reconnect before the next poll if the connection has closed in between', async () => {
            mockModbusClients.length = 0;
            const connectTCP = jest.fn().mockResolvedValue(undefined);
            const client = CreateMockClient({ connectTCP, readCoils: jest.fn().mockResolvedValue({ data: new Array(8).fill(false) }) });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => client);

            const handle = await service.monitorDigitalOutputs('slave-1', 10, 8);
            expect(connectTCP).toHaveBeenCalledTimes(1);
            client.isOpen = false;

            await new Promise((resolve) => setTimeout(resolve, 30));
            await handle.stop();

            expect(connectTCP.mock.calls.length).toBeGreaterThanOrEqual(2);
        });

        it('should log a warning and keep polling when a read fails', async () => {
            mockModbusClients.length = 0;
            const readCoils = jest.fn()
                .mockRejectedValueOnce(new Error('bus error'))
                .mockResolvedValue({ data: new Array(8).fill(false) });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({ readCoils }));

            const handle = await service.monitorDigitalOutputs('slave-1', 10, 8);
            await new Promise((resolve) => setTimeout(resolve, 30));
            await handle.stop();

            expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ deviceId: 'slave-1' }), 'digital output monitor read failed');
        });
    });

    describe('monitorDigitalInputs (long-press detection)', () => {
        it('should invoke onLongPress once a channel has been held past longPressMs', async () => {
            mockModbusClients.length = 0;
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readDiscreteInputs: jest.fn().mockResolvedValue({ data: [true, false] })
            }));

            const onLongPress = jest.fn();
            const handle = await service.monitorDigitalInputs('slave-1', 10, 2, 30, onLongPress);

            await new Promise((resolve) => setTimeout(resolve, 80));
            await handle.stop();

            expect(onLongPress).toHaveBeenCalledTimes(1);
            expect(onLongPress).toHaveBeenCalledWith(expect.objectContaining({ channel: 0, heldMs: expect.any(Number) }));
            expect(onLongPress.mock.calls[0][0].heldMs).toBeGreaterThanOrEqual(30);
            expect(logger.log).toHaveBeenCalledWith(expect.objectContaining({ deviceId: 'slave-1', channel: 0 }), 'digital input long press detected');
        });

        it('should not invoke onLongPress and should reset state when the channel is released before longPressMs', async () => {
            mockModbusClients.length = 0;
            const pollResults = [[true, false], [true, false], [false, false]];
            let callIndex = 0;
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readDiscreteInputs: jest.fn(() => Promise.resolve({ data: pollResults[Math.min(callIndex++, pollResults.length - 1)] }))
            }));

            const onLongPress = jest.fn();
            const handle = await service.monitorDigitalInputs('slave-1', 10, 2, 25, onLongPress);

            await new Promise((resolve) => setTimeout(resolve, 80));
            await handle.stop();

            expect(onLongPress).not.toHaveBeenCalled();
        });

        it('should only fire onLongPress once even when held across several polls past the threshold', async () => {
            mockModbusClients.length = 0;
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readDiscreteInputs: jest.fn().mockResolvedValue({ data: [true] })
            }));

            const onLongPress = jest.fn();
            const handle = await service.monitorDigitalInputs('slave-1', 10, 1, 20, onLongPress);

            await new Promise((resolve) => setTimeout(resolve, 100));
            await handle.stop();

            expect(onLongPress).toHaveBeenCalledTimes(1);
        });

        it('should reject when no device is found for the deviceId', async () => {
            deviceRepository.get.mockResolvedValue(null);

            await expect(service.monitorDigitalInputs('missing-device', 10, 8, 5000))
                .rejects.toThrow('monitorDigitalInputs: no device found for deviceId "missing-device"');
        });

        it('should reconnect before the next poll if the connection has closed in between', async () => {
            mockModbusClients.length = 0;
            const connectTCP = jest.fn().mockResolvedValue(undefined);
            const client = CreateMockClient({ connectTCP, readDiscreteInputs: jest.fn().mockResolvedValue({ data: new Array(8).fill(false) }) });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => client);

            const handle = await service.monitorDigitalInputs('slave-1', 10, 8, 5000);
            expect(connectTCP).toHaveBeenCalledTimes(1);
            client.isOpen = false;

            await new Promise((resolve) => setTimeout(resolve, 30));
            await handle.stop();

            expect(connectTCP.mock.calls.length).toBeGreaterThanOrEqual(2);
        });

        it('should log a warning and keep polling when a read fails', async () => {
            mockModbusClients.length = 0;
            const readDiscreteInputs = jest.fn()
                .mockRejectedValueOnce(new Error('bus error'))
                .mockResolvedValue({ data: new Array(8).fill(false) });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({ readDiscreteInputs }));

            const handle = await service.monitorDigitalInputs('slave-1', 10, 8, 5000);
            await handle.stop();

            expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ deviceId: 'slave-1' }), 'digital input monitor read failed');
        });
    });

    // probeMasterForNewSlave: methode "un seul coup" (plus de recurrence/multi-master ici, cf.
    // DeviceService.watchMasterDevicesForNewSlaves) - la plupart des tests s'appuient sur un mock
    // ModbusRTU par defaut qui NE detecte jamais rien (readHoldingRegisters rejette), pour ne pas
    // declencher de provisioning parasite ; chaque test qui veut simuler une detection injecte un
    // client dedie via mockImplementationOnce.
    describe('probeMasterForNewSlave', () => {
        function CreateUndetectedClient(overrides: Partial<MockModbusClient> = {}): MockModbusClient {
            return CreateMockClient({
                readHoldingRegisters: jest.fn().mockRejectedValue(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })),
                ...overrides
            });
        }

        function CreateDiscoveryMasterModel(id: string, overrides: Partial<MasterConfigModel> = {}): DeviceModel {
            const device = new DeviceModel();
            device._id = id;
            device.name = id;
            device.type = DeviceType.MASTER;
            const config = new MasterConfigModel();
            config.protocol = MasterProtocol.TCP;
            config.ipAddress = '192.0.2.1';
            config.port = 502;
            config.timeout = 2000;
            config.discoveryRegisters = [AO8CH_DEVICE_ADDRESS_REGISTER];
            device.config = Object.assign(config, overrides);
            return device;
        }

        function CreateDiscoverySlaveModel(id: string, slaveId: number, masterDeviceId: string): DeviceModel {
            const device = new DeviceModel();
            device._id = id;
            device.name = id;
            device.type = DeviceType.SLAVE;
            const config = new SlaveConfigModel();
            config.slaveId = slaveId;
            config.masterDeviceId = masterDeviceId;
            device.config = config;
            return device;
        }

        beforeEach(() => {
            mockModbusClients.length = 0;
            deviceRepository.getByType = jest.fn().mockResolvedValue([]);
            deviceRepository.save = jest.fn();
            (ModbusRTU as unknown as jest.Mock).mockImplementation(() => CreateUndetectedClient());
        });

        it('should never probe a master with no discoveryRegisters configured (opt-in, no fallback)', async () => {
            const masterWithout = CreateDiscoveryMasterModel('master-no-discovery', { discoveryRegisters: undefined });

            await service.probeMasterForNewSlave(masterWithout);

            expect(mockModbusClients).toHaveLength(0);
        });

        it('should never probe a master with an empty discoveryRegisters array', async () => {
            const masterWithEmpty = CreateDiscoveryMasterModel('master-empty-discovery', { discoveryRegisters: [] });

            await service.probeMasterForNewSlave(masterWithEmpty);

            expect(mockModbusClients).toHaveLength(0);
        });

        it('should probe multiple registers sequentially on the same connection and write to the one that responded', async () => {
            const master = CreateDiscoveryMasterModel('master-multi', { discoveryRegisters: [0x1000, 0x4000] });
            deviceRepository.save = jest.fn().mockResolvedValue(CreateDiscoverySlaveModel('new-id', 2, 'master-multi'));

            const connectTCP = jest.fn().mockResolvedValue(undefined);
            const writeRegister = jest.fn().mockResolvedValue({ address: 0, value: 0 });
            const readHoldingRegisters = jest.fn()
                .mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))
                .mockResolvedValueOnce({ data: [1] });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                connectTCP,
                readHoldingRegisters,
                writeRegister
            }));

            await service.probeMasterForNewSlave(master);

            expect(connectTCP).toHaveBeenCalledTimes(1);
            expect(readHoldingRegisters).toHaveBeenNthCalledWith(1, 0x1000, 1);
            expect(readHoldingRegisters).toHaveBeenNthCalledWith(2, 0x4000, 1);
            expect(writeRegister).toHaveBeenCalledWith(0x4000, 2);
        });

        it('should assign slaveId 2 (floor) and persist a new device when a master with no existing slaves detects an unconfigured module', async () => {
            const master = CreateDiscoveryMasterModel('master-x');
            deviceRepository.save = jest.fn().mockResolvedValue(CreateDiscoverySlaveModel('new-id', 2, 'master-x'));
            const writeRegister = jest.fn().mockResolvedValue({ address: 0, value: 0 });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockResolvedValue({ data: [1] }),
                writeRegister
            }));

            await service.probeMasterForNewSlave(master);

            expect(writeRegister).toHaveBeenCalledWith(AO8CH_DEVICE_ADDRESS_REGISTER, 2);
            expect(deviceRepository.save).toHaveBeenCalledWith(expect.objectContaining({
                type: DeviceType.SLAVE,
                kind: DeviceKind.MODBUS_SLAVE,
                config: expect.objectContaining({ slaveId: 2, masterDeviceId: 'master-x' })
            }));
        });

        it('should assign sequential unique slaveIds across successive detections on the same master', async () => {
            const master = CreateDiscoveryMasterModel('master-seq');
            let currentSlaves: DeviceModel[] = [];
            deviceRepository.getByType = jest.fn().mockImplementation(() => Promise.resolve(currentSlaves));
            deviceRepository.save = jest.fn((model: DeviceModel) => {
                const saved = Object.assign(new DeviceModel(), model, { _id: `slave-${(model.config as SlaveConfigModel).slaveId}` });
                currentSlaves = [...currentSlaves, saved];
                return Promise.resolve(saved);
            });
            const writeRegister = jest.fn().mockResolvedValue({ address: 0, value: 0 });
            (ModbusRTU as unknown as jest.Mock)
                .mockImplementationOnce(() => CreateMockClient({ readHoldingRegisters: jest.fn().mockResolvedValue({ data: [1] }), writeRegister }))
                .mockImplementationOnce(() => CreateMockClient({ readHoldingRegisters: jest.fn().mockResolvedValue({ data: [1] }), writeRegister }));

            await service.probeMasterForNewSlave(master);
            await service.probeMasterForNewSlave(master);

            expect(writeRegister).toHaveBeenNthCalledWith(1, AO8CH_DEVICE_ADDRESS_REGISTER, 2);
            expect(writeRegister).toHaveBeenNthCalledWith(2, AO8CH_DEVICE_ADDRESS_REGISTER, 3);
        });

        it('should only count existing slaves belonging to the same master when computing newSlaveId (no cross-master leakage)', async () => {
            const masterA = CreateDiscoveryMasterModel('master-a', { ipAddress: '10.0.0.1' });
            const siblingsOfB = [
                CreateDiscoverySlaveModel('slave-b1', 5, 'master-b'),
                CreateDiscoverySlaveModel('slave-b2', 6, 'master-b')
            ];
            deviceRepository.getByType = jest.fn().mockResolvedValue(siblingsOfB);
            deviceRepository.save = jest.fn().mockResolvedValue(CreateDiscoverySlaveModel('new-id', 2, 'master-a'));

            const writeRegister = jest.fn().mockResolvedValue({ address: 0, value: 0 });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockResolvedValue({ data: [1] }),
                writeRegister
            }));

            await service.probeMasterForNewSlave(masterA);

            expect(writeRegister).toHaveBeenCalledWith(AO8CH_DEVICE_ADDRESS_REGISTER, 2);
        });

        it('should leave the device unconfigured for retry (no save) when the address write fails', async () => {
            const master = CreateDiscoveryMasterModel('master-w');

            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockResolvedValue({ data: [1] }),
                writeRegister: jest.fn().mockRejectedValue(new Error('write boom'))
            }));

            await service.probeMasterForNewSlave(master);

            expect(deviceRepository.save).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(
                expect.objectContaining({ masterId: 'master-w', err: 'write boom' }),
                'new slave address write failed, device left unconfigured for retry'
            );
        });

        it('should attempt a best-effort rollback to the unconfigured unit id when the db save fails after a successful write', async () => {
            const master = CreateDiscoveryMasterModel('master-r');
            deviceRepository.save = jest.fn().mockRejectedValue(new Error('db boom'));

            const writeRegister = jest.fn().mockResolvedValue({ address: 0, value: 0 });
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockResolvedValue({ data: [1] }),
                writeRegister
            }));

            await service.probeMasterForNewSlave(master);

            expect(writeRegister).toHaveBeenNthCalledWith(1, AO8CH_DEVICE_ADDRESS_REGISTER, 2);
            expect(writeRegister).toHaveBeenNthCalledWith(2, AO8CH_DEVICE_ADDRESS_REGISTER, DEFAULT_UNCONFIGURED_UNIT_ID);
            expect(logger.error).toHaveBeenCalledWith(
                expect.objectContaining({ masterId: 'master-r', newSlaveId: 2 }),
                'rollback succeeded, device remains discoverable'
            );
        });

        it('should log a critical error when both the db save and the rollback write fail', async () => {
            const master = CreateDiscoveryMasterModel('master-c');
            deviceRepository.save = jest.fn().mockRejectedValue(new Error('db boom'));

            const writeRegister = jest.fn()
                .mockResolvedValueOnce({ address: 0, value: 0 })
                .mockRejectedValueOnce(new Error('rollback boom'));
            (ModbusRTU as unknown as jest.Mock).mockImplementationOnce(() => CreateMockClient({
                readHoldingRegisters: jest.fn().mockResolvedValue({ data: [1] }),
                writeRegister
            }));

            await service.probeMasterForNewSlave(master);

            expect(logger.error).toHaveBeenCalledWith(
                expect.objectContaining({ masterId: 'master-c', err: 'rollback boom' }),
                expect.stringContaining('CRITICAL')
            );
        });

        it('should serialize the discovery probe behind an in-flight execute() call on the same bus', async () => {
            const order: string[] = [];
            let resolveExecuteRead!: (value: { data: number[] }) => void;
            const executeReadPromise = new Promise<{ data: number[] }>((resolve) => { resolveExecuteRead = resolve; });

            const master = CreateDiscoveryMasterModel('master-order');

            (ModbusRTU as unknown as jest.Mock)
                .mockImplementationOnce(() => CreateMockClient({
                    readHoldingRegisters: jest.fn(() => {
                        order.push('execute-start');
                        return executeReadPromise.then((data) => { order.push('execute-end'); return data; });
                    })
                }))
                .mockImplementationOnce(() => CreateMockClient({
                    readHoldingRegisters: jest.fn(() => {
                        order.push('probe-start');
                        return Promise.reject(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
                    })
                }));

            const executeCall = service.execute(CreateModbusTaskModel());
            await new Promise((resolve) => setImmediate(resolve));
            expect(order).toEqual(['execute-start']);

            const probeCall = service.probeMasterForNewSlave(master);
            await new Promise((resolve) => setImmediate(resolve));
            // la sonde de decouverte doit toujours attendre derriere la lecture execute() en cours.
            expect(order).toEqual(['execute-start']);

            resolveExecuteRead({ data: [0, 0] });
            await executeCall;
            await probeCall;

            expect(order).toEqual(['execute-start', 'execute-end', 'probe-start']);
        });
    });
});
