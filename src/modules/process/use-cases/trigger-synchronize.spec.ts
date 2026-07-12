import { MockClass } from '@framework/utils/test.utils';
import { TriggerModel } from '@process/domain/models/trigger.model';
import { SynchronizeService } from '@process/domain/services/synchronize.service';
import { TriggerSynchronizeUC } from './trigger-synchronize.uc';

describe('Process use case test', () => {
    it('Should execute trigger sync and return a response dto', async () => {
        // GIVEN
        const synchronizeService = MockClass(SynchronizeService);
        jest.spyOn(synchronizeService, 'synchronizeTrigger')
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .mockImplementation((_model: TriggerModel): Promise<TriggerModel> =>
                Promise.resolve().then(() => new TriggerModel()));
        const triggerModel = new TriggerModel();

        // WHEN
        const uc = new TriggerSynchronizeUC(synchronizeService);
        await uc.execute(triggerModel);

        // THEN
        expect(synchronizeService.synchronizeTrigger).toHaveBeenLastCalledWith(triggerModel);
        expect(synchronizeService.synchronizeTrigger).toHaveBeenCalledTimes(1);
    });
});
