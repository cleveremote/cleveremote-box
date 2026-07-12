import { MockClass } from '@framework/utils/test.utils';
import { SynchronizeScheduleModel } from '@process/domain/models/synchronize.model';
import { SynchronizeService } from '@process/domain/services/synchronize.service';
import { ScheduleSynchronizeUC } from './schedule-synchronize.uc';
describe('Process use case test', () => {
    it('Should execute schedule sync and return a response dto', async () => {
        // GIVEN
        const synchronizeService = MockClass(SynchronizeService);
        jest.spyOn(synchronizeService, 'synchronizeSchedule')
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .mockImplementation((_process: SynchronizeScheduleModel): Promise<SynchronizeScheduleModel> =>
                Promise.resolve().then(() => new SynchronizeScheduleModel()));
        const synchronizeScheduleModel = new SynchronizeScheduleModel();

        // WHEN
        const uc = new ScheduleSynchronizeUC(synchronizeService);
        await uc.execute(synchronizeScheduleModel);

        // THEN
        expect(synchronizeService.synchronizeSchedule).toHaveBeenLastCalledWith(synchronizeScheduleModel);
        expect(synchronizeService.synchronizeSchedule).toBeTruthy();
        expect(synchronizeService.synchronizeSchedule).toHaveBeenCalledTimes(1);
    });
});
