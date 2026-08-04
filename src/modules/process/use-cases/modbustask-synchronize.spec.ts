import { MockClass } from '@framework/utils/test.utils';
import { ComRequestModel } from '@process/domain/models/com-request.model';
import { SynchronizeService } from '@process/domain/services/synchronize.service';
import { ModbusTaskSynchronizeUC } from './modbustask-synchronize.uc';

describe('Process use case test', () => {
    it('Should execute modbus task sync and return a response dto', async () => {
        // GIVEN
        const synchronizeService = MockClass(SynchronizeService);
        jest.spyOn(synchronizeService, 'synchronizeModbusTaskList')
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .mockImplementation((_models: ComRequestModel[]): Promise<ComRequestModel[]> =>
                Promise.resolve().then(() => [new ComRequestModel()]));
        const modbusTaskConfigModels = [new ComRequestModel()];

        // WHEN
        const uc = new ModbusTaskSynchronizeUC(synchronizeService);
        await uc.execute(modbusTaskConfigModels);

        // THEN
        expect(synchronizeService.synchronizeModbusTaskList).toHaveBeenLastCalledWith(modbusTaskConfigModels);
        expect(synchronizeService.synchronizeModbusTaskList).toHaveBeenCalledTimes(1);
    });
});
