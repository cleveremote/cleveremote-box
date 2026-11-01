import { DeviceConnectivityModel, DeviceKind, DeviceModel, DeviceType, SlaveConfigModel } from '@process/domain/models/device.model';
import { DigitalInputLongPress, DigitalIoChange, DigitalIoMonitorService } from '@process/domain/services/digital-io-monitor.service';
import { RegisterFunction, RegisterMapTemplate, RegisterOperationOutcome } from '@register-map/domain/models/register-map.model';

// Template réduit d'un module IO 8 voies : entrées (discrete inputs) et sorties (coils) lisibles
const IO_TEMPLATE = {
    kind: DeviceKind.DIGITAL_IO_8_CH,
    registerMap: [
        { id: 'outputs', area: 'coil', operations: [{ id: 'read', function: RegisterFunction.READ_COILS }, { id: 'set', function: RegisterFunction.WRITE_SINGLE_COIL }] },
        { id: 'allOutputs', area: 'coil', operations: [{ id: 'set', function: RegisterFunction.WRITE_SINGLE_COIL }] },
        { id: 'inputs', area: 'discreteInput', operations: [{ id: 'read', function: RegisterFunction.READ_DISCRETE_INPUTS }] },
        { id: 'version', area: 'holdingRegister', operations: [{ id: 'read', function: RegisterFunction.READ_HOLDING_REGISTERS }] }
    ]
} as unknown as RegisterMapTemplate;

function CreateSlave(_id: string, kind: DeviceKind = DeviceKind.DIGITAL_IO_8_CH, connected?: boolean): DeviceModel {
    const config = { slaveId: 62, masterDeviceId: 'master-1', kind } as SlaveConfigModel;
    const connectivity = connected === undefined ? undefined : Object.assign(new DeviceConnectivityModel(), { connected });
    return Object.assign(new DeviceModel(), { _id, type: DeviceType.SLAVE, name: _id, config, connectivity });
}

function Outcome(blockId: string, bits: boolean[]): RegisterOperationOutcome {
    return {
        isOk: true, blockId, operationId: 'read', request: undefined, durationMs: 1,
        value: { type: 'boolean[]', channels: bits.map((value, index) => ({ index, number: index + 1, value })) }
    };
}

describe('DigitalIoMonitorService', () => {
    let devices: DeviceModel[];
    let bits: Record<string, boolean[]>;
    let deviceRepository: { getByType: jest.Mock };
    let deviceCommandService: { getTemplate: jest.Mock; executeOnDevice: jest.Mock };
    let logger: { log: jest.Mock; warn: jest.Mock };
    let service: DigitalIoMonitorService;
    let inputChanges: DigitalIoChange[];
    let outputChanges: DigitalIoChange[];
    let longPresses: DigitalInputLongPress[];

    beforeEach(() => {
        devices = [CreateSlave('io-1')];
        bits = { inputs: [false, false, false], outputs: [false, false, false] };
        deviceRepository = { getByType: jest.fn(async () => devices) };
        deviceCommandService = {
            getTemplate: jest.fn((kind: string) => {
                if (kind !== DeviceKind.DIGITAL_IO_8_CH) throw new Error(`Aucune register map pour le kind ${kind}`);
                return IO_TEMPLATE;
            }),
            executeOnDevice: jest.fn(async (_deviceId: string, { blockId }: { blockId: string }) => Outcome(blockId, bits[blockId]))
        };
        logger = { log: jest.fn(), warn: jest.fn() };
        service = new DigitalIoMonitorService(deviceRepository as never, deviceCommandService as never, logger as never);
        inputChanges = [];
        outputChanges = [];
        longPresses = [];
        service.inputChanges$.subscribe((change) => inputChanges.push(change));
        service.outputChanges$.subscribe((change) => outputChanges.push(change));
        service.inputLongPress$.subscribe((event) => longPresses.push(event));
    });

    afterEach(() => {
        service.stop();
        jest.useRealTimers();
    });

    it('should read only the readable discrete input and coil blocks of the template', async () => {
        await service.poll();

        const reads = deviceCommandService.executeOnDevice.mock.calls.map(([deviceId, op]) => `${deviceId}:${op.blockId}.${op.operationId}`);
        expect(reads).toEqual(['io-1:outputs.read', 'io-1:inputs.read']);
    });

    it('should use the first read as reference without emitting any event', async () => {
        bits.inputs = [true, false, true];
        bits.outputs = [false, true, false];

        await service.poll();

        expect(inputChanges).toEqual([]);
        expect(outputChanges).toEqual([]);
    });

    it('should emit one input change per channel that changed', async () => {
        await service.poll();
        bits.inputs = [true, false, true];
        await service.poll();

        expect(inputChanges).toEqual([
            { deviceId: 'io-1', channel: 0, previous: false, current: true },
            { deviceId: 'io-1', channel: 2, previous: false, current: true }
        ]);
        expect(outputChanges).toEqual([]);
    });

    it('should emit output changes on outputChanges$', async () => {
        bits.outputs = [true, false, false];
        await service.poll();
        bits.outputs = [false, false, false];
        await service.poll();

        expect(outputChanges).toEqual([{ deviceId: 'io-1', channel: 0, previous: true, current: false }]);
        expect(inputChanges).toEqual([]);
    });

    it('should emit a long press once per press, and re-arm it on release', async () => {
        jest.useFakeTimers('modern');
        jest.setSystemTime(0);
        await service.poll(30);
        bits.inputs = [true, false, false];
        await service.poll(30);
        jest.setSystemTime(20);
        await service.poll(30);
        expect(longPresses).toEqual([]);

        jest.setSystemTime(40);
        await service.poll(30);
        jest.setSystemTime(80);
        await service.poll(30);
        expect(longPresses).toEqual([{ deviceId: 'io-1', channel: 0, heldMs: 40 }]);

        bits.inputs = [false, false, false];
        await service.poll(30);
        bits.inputs = [true, false, false];
        jest.setSystemTime(100);
        await service.poll(30);
        jest.setSystemTime(140);
        await service.poll(30);
        expect(longPresses).toHaveLength(2);
    });

    it('should keep the previous state and emit nothing when a read fails', async () => {
        await service.poll();
        deviceCommandService.executeOnDevice.mockResolvedValueOnce({ isOk: false, blockId: 'outputs', error: { message: 'Timed out' } });
        deviceCommandService.executeOnDevice.mockRejectedValueOnce(new Error('Port Not Open'));
        bits.inputs = [true, false, false];
        await service.poll();

        expect(logger.warn).toHaveBeenCalledTimes(2);
        expect(inputChanges).toEqual([]);

        await service.poll();
        expect(inputChanges).toEqual([{ deviceId: 'io-1', channel: 0, previous: false, current: true }]);
    });

    it('should skip disconnected slaves and slaves without digital blocks', async () => {
        devices = [CreateSlave('io-off', DeviceKind.DIGITAL_IO_8_CH, false), CreateSlave('sensor-1', DeviceKind.MODBUS_SLAVE), CreateSlave('io-1')];

        await service.poll();

        const deviceIds = new Set(deviceCommandService.executeOnDevice.mock.calls.map(([deviceId]) => deviceId));
        expect([...deviceIds]).toEqual(['io-1']);
    });
});
