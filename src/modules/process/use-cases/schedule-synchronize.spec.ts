import { MockClass } from '@framework/utils/test.utils';
import { SynchronizeCycleModel, SynchronizeScheduleModel } from '@process/domain/models/synchronize.model';
import { SynchronizeService } from '@process/domain/services/synchronize.service';
import { ScheduleSynchronizeUC } from './schedule-synchronize.uc';
describe('Process use case test', () => {
    it('Should execute schedule sync and return a response dto', async () => {
        // GIVEN
        const synchronizeService = MockClass(SynchronizeService);
        jest.spyOn(synchronizeService, 'sychronizeSchedule')
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .mockImplementation((_process: SynchronizeScheduleModel): Promise<SynchronizeCycleModel> =>
                Promise.resolve().then(() => new SynchronizeCycleModel()));
        const synchronizeScheduleModel = new SynchronizeScheduleModel();

        // WHEN
        const uc = new ScheduleSynchronizeUC(synchronizeService);
        await uc.execute(synchronizeScheduleModel);

        // THEN
        expect(synchronizeService.sychronizeSchedule).toHaveBeenLastCalledWith(synchronizeScheduleModel);
        expect(synchronizeService.sychronizeSchedule).toBeTruthy();
        expect(synchronizeService.sychronizeSchedule).toHaveBeenCalledTimes(1);
    });
});
