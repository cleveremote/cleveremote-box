import { MockClass } from '@framework/utils/test.utils';
import { SynchronizeCycleModel } from '@process/domain/models/synchronize.model';
import { SynchronizeService } from '@process/domain/services/synchronize.service';
import { CycleSynchronizeUC } from './cycle-synchronize.uc';
describe('Process use case test', () => {
    it('Should execute partial sync and return a response dto', async () => {
        // GIVEN
        const synchronizeService = MockClass(SynchronizeService);
        jest.spyOn(synchronizeService, 'sychronizePartial')
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .mockImplementation((_process: SynchronizeCycleModel): Promise<SynchronizeCycleModel> =>
                Promise.resolve().then(() => new SynchronizeCycleModel()));
        const synchronizeCycleModel = new SynchronizeCycleModel();

        // WHEN
        const uc = new CycleSynchronizeUC(synchronizeService);
        await uc.execute(synchronizeCycleModel);

        // THEN
        expect(synchronizeService.sychronizePartial).toHaveBeenLastCalledWith(synchronizeCycleModel);
        expect(synchronizeService.sychronizePartial).toBeTruthy();
        expect(synchronizeService.sychronizePartial).toHaveBeenCalledTimes(1);
    });
});
