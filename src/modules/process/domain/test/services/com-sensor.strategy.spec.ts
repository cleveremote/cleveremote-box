import { NotImplementedError } from '@process/domain/errors/not-implemented.error';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { ComSensorConfigModel, SensorModel } from '@process/domain/models/sensor.model';
import { ComSensorStrategy } from '@process/domain/services/sensor-strategies/com-sensor.strategy';
import { ModbusFunctionName } from '@process/domain/models/com-request.model';

function CreateComSensorModel(): SensorModel {
    const sensor = new SensorModel();
    sensor.type = SensorType.COM;
    sensor.config = new ComSensorConfigModel();
    sensor.config.cronPattern = '*/30 * * * * *';
    sensor.config.comRequestId = 'request-1';
    return sensor;
}

describe('ComSensorStrategy', () => {
    let modbusService: { execute: jest.Mock };
    let comRequestRepository: { get: jest.Mock };
    let strategy: ComSensorStrategy;

    beforeEach(() => {
        modbusService = { execute: jest.fn() };
        comRequestRepository = { get: jest.fn().mockResolvedValue({ name: 'request-1', config: { params: { unit: '°C' } } }) };
        strategy = new ComSensorStrategy(modbusService as never, comRequestRepository as never);
    });

    it('should have the COM type', () => {
        expect(strategy.type).toEqual(SensorType.COM);
    });

    it('should read holding registers and map each value to a ReadResultItem', async () => {
        const sensor = CreateComSensorModel();
        modbusService.execute.mockResolvedValue({
            function: ModbusFunctionName.READ_HOLDING_REGISTERS,
            result: { data: [12, 34] }
        });

        const result = await strategy.read(sensor);

        expect(comRequestRepository.get).toHaveBeenCalledWith('request-1');
        expect(modbusService.execute).toHaveBeenCalledWith(expect.objectContaining({ name: 'request-1' }));
        expect(result).toEqual([
            { value: 12, isFormated: false, unit: '°C', name: 'request-1' },
            { value: 34, isFormated: false, unit: '°C', name: 'request-1' }
        ]);
    });

    it('should return the decoded/formula-evaluated value when config.type is set on the com request (meter-style)', async () => {
        const sensor = CreateComSensorModel();
        modbusService.execute.mockResolvedValue({
            function: ModbusFunctionName.READ_HOLDING_REGISTERS,
            result: { data: [1234, 0, 0, 16128], evaluated: { formula: '(N + Nf) * 10^(n - 3)', scope: { N: 1234, Nf: 0.5, n: 3 }, value: 1234.5 } }
        });

        const result = await strategy.read(sensor);

        expect(result).toEqual([{ value: 1234.5, isFormated: false, unit: '°C', name: 'request-1' }]);
    });

    it('should return the decoded/formula-evaluated value for READ_INPUT_REGISTERS too', async () => {
        const sensor = CreateComSensorModel();
        modbusService.execute.mockResolvedValue({
            function: ModbusFunctionName.READ_INPUT_REGISTERS,
            result: { data: [21], evaluated: { formula: 'raw * 2', scope: { raw: 21 }, value: 42 } }
        });

        const result = await strategy.read(sensor);

        expect(result).toEqual([{ value: 42, isFormated: false, unit: '°C', name: 'request-1' }]);
    });

    it('should throw NotImplementedError when modbus returns no result', async () => {
        const sensor = CreateComSensorModel();
        modbusService.execute.mockResolvedValue(undefined);

        await expect(strategy.read(sensor)).rejects.toThrow(NotImplementedError);
    });

    it('should throw NotImplementedError for an unsupported modbus function', async () => {
        const sensor = CreateComSensorModel();
        modbusService.execute.mockResolvedValue({
            function: ModbusFunctionName.WRITE_SINGLE_REGISTER,
            result: { address: 0, value: 1 }
        });

        await expect(strategy.read(sensor)).rejects.toThrow(NotImplementedError);
    });

    it('should read coils/discrete inputs and map each boolean value to a number', async () => {
        const sensor = CreateComSensorModel();
        modbusService.execute.mockResolvedValue({
            function: ModbusFunctionName.READ_DISCRETE_INPUTS,
            result: { data: [true, false] }
        });

        const result = await strategy.read(sensor);

        expect(result.map((r) => r.value)).toEqual([1, 0]);
    });

    it('should default unit to an empty string when the comrequest has no params.unit', async () => {
        comRequestRepository.get.mockResolvedValue({ name: 'request-1', config: {} });
        const sensor = CreateComSensorModel();
        modbusService.execute.mockResolvedValue({
            function: ModbusFunctionName.READ_HOLDING_REGISTERS,
            result: { data: [12] }
        });

        const result = await strategy.read(sensor);

        expect(result).toEqual([{ value: 12, isFormated: false, unit: '', name: 'request-1' }]);
    });

    it('should override the address using config.code and mark the result as formated for a child (parent) sensor', async () => {
        comRequestRepository.get.mockResolvedValue({ name: 'request-1', config: { address: 100, params: { unit: '°C' } } });
        const sensor = CreateComSensorModel();
        (sensor.config as ComSensorConfigModel).code = 5;
        sensor.parentId = null;
        modbusService.execute.mockResolvedValue({
            function: ModbusFunctionName.READ_HOLDING_REGISTERS,
            result: { data: [42] }
        });

        const result = await strategy.read(sensor);

        expect(modbusService.execute).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'request-1' }),
            { address: 105, params: { length: 1 } }
        );
        expect(result).toEqual([{ value: 42, isFormated: true, unit: '°C', name: 'request-1' }]);
    });

    it('should default unit to an empty string for the parent-sensor branch when params.unit is absent', async () => {
        comRequestRepository.get.mockResolvedValue({ name: 'request-1', config: { address: 100 } });
        const sensor = CreateComSensorModel();
        (sensor.config as ComSensorConfigModel).code = 5;
        sensor.parentId = null;
        modbusService.execute.mockResolvedValue({
            function: ModbusFunctionName.READ_HOLDING_REGISTERS,
            result: { data: [42] }
        });

        const result = await strategy.read(sensor);

        expect(result).toEqual([{ value: 42, isFormated: true, unit: '', name: 'request-1' }]);
    });
});
