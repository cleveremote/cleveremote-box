import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { ComSensorConfigModel, SensorModel } from '@process/domain/models/sensor.model';
import { ComSensorStrategy } from '@process/domain/services/sensor-strategies/com-sensor.strategy';
import { DecodedValue, RegisterFunction, RegisterOperationOutcome } from '@register-map/domain/models/register-map.model';

function CreateComSensorModel(field?: string): SensorModel {
    const sensor = new SensorModel();
    sensor._id = 'sensor-1';
    sensor.type = SensorType.COM;
    sensor.config = Object.assign(new ComSensorConfigModel(), { cronPattern: '*/30 * * * * *', commandId: 'cmd-1', deviceId: 'slave-1', field });
    return sensor;
}

function CreateOutcome(value: DecodedValue, isOk = true): RegisterOperationOutcome {
    return {
        isOk, blockId: 'pv', operationId: 'read', durationMs: 1, value,
        request: { function: RegisterFunction.READ_HOLDING_REGISTERS, address: 4, length: 1 },
        ...(!isOk && { error: { message: 'Timed out' } })
    };
}

const FIELDS: DecodedValue = {
    type: 'fields',
    fields: [
        { name: 'pv', label: 'Mesure', raw: 1234, value: 12.34, unit: 'bar' },
        { name: 'decimals', label: 'Décimales', raw: 2, value: 2 }
    ]
};

describe('ComSensorStrategy', () => {
    let deviceCommandService: { execute: jest.Mock };
    let strategy: ComSensorStrategy;

    beforeEach(() => {
        deviceCommandService = { execute: jest.fn().mockResolvedValue(CreateOutcome(FIELDS)) };
        strategy = new ComSensorStrategy(deviceCommandService as never);
    });

    it('should have the COM type', () => {
        expect(strategy.type).toEqual(SensorType.COM);
    });

    it('should read the DeviceCommand and keep only the configured field', async () => {
        const result = await strategy.read(CreateComSensorModel('pv'));

        expect(deviceCommandService.execute).toHaveBeenCalledWith('cmd-1', 'slave-1');
        expect(result).toEqual([{ value: 12.34, isFormated: true, unit: 'bar', name: 'pv' }]);
    });

    it('should return every numeric field when no field is configured, with an empty unit when absent', async () => {
        const result = await strategy.read(CreateComSensorModel());

        expect(result).toEqual([
            { value: 12.34, isFormated: true, unit: 'bar', name: 'pv' },
            { value: 2, isFormated: true, unit: '', name: 'decimals' }
        ]);
    });

    it('should map channel results (coils / discrete inputs) to numbers', async () => {
        deviceCommandService.execute.mockResolvedValue(CreateOutcome({
            type: 'boolean[]', channels: [{ index: 0, number: 1, value: true }, { index: 1, number: 2, value: false }]
        }));

        const result = await strategy.read(CreateComSensorModel());

        expect(result.map((r) => r.value)).toEqual([1, 0]);
    });

    it('should throw when the modbus read failed', async () => {
        deviceCommandService.execute.mockResolvedValue(CreateOutcome(undefined, false));

        await expect(strategy.read(CreateComSensorModel())).rejects.toThrow('pv.read : Timed out');
    });

    it('should throw when the sensor has no commandId', async () => {
        const sensor = CreateComSensorModel();
        (sensor.config as ComSensorConfigModel).commandId = undefined;

        await expect(strategy.read(sensor)).rejects.toThrow('sans commandId');
        expect(deviceCommandService.execute).not.toHaveBeenCalled();
    });

    it('should throw when the sensor has no deviceId', async () => {
        const sensor = CreateComSensorModel();
        (sensor.config as ComSensorConfigModel).deviceId = undefined;

        await expect(strategy.read(sensor)).rejects.toThrow('sans commandId ou deviceId');
        expect(deviceCommandService.execute).not.toHaveBeenCalled();
    });
});
