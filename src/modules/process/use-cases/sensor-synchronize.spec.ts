import { MockClass } from '@framework/utils/test.utils';
import { SensorModel } from '@process/domain/models/sensor.model';
import { SynchronizeService } from '@process/domain/services/synchronize.service';
import { SensorSynchronizeUC } from './sensor-synchronize.uc';

describe('Process use case test', () => {
    it('Should execute sensor sync and return a response dto', async () => {
        // GIVEN
        const synchronizeService = MockClass(SynchronizeService);
        jest.spyOn(synchronizeService, 'sychronizeSensor')
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .mockImplementation((_model: SensorModel): Promise<SensorModel> =>
                Promise.resolve().then(() => new SensorModel()));
        const sensorModel = new SensorModel();

        // WHEN
        const uc = new SensorSynchronizeUC(synchronizeService);
        await uc.execute(sensorModel);

        // THEN
        expect(synchronizeService.sychronizeSensor).toHaveBeenLastCalledWith(sensorModel);
        expect(synchronizeService.sychronizeSensor).toHaveBeenCalledTimes(1);
    });
});
