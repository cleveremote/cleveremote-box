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
});
