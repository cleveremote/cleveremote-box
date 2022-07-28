import { MockClass } from '@framework/utils/test.utils';
import { StructureModel } from '@process/domain/models/structure.model';
import { ConfigurationService } from '@process/domain/services/configuration.service';
import { SynchronizeService } from '@process/domain/services/synchronize.service';
import { ConfigurationSynchronizeUC } from './configuration-synchronize.uc';

describe('Process use case test', () => {
    it('Should execute process and return a response dto', async () => {
        // GIVEN
        const synchronizeService = MockClass(SynchronizeService);
        jest.spyOn(synchronizeService, 'synchronize')
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .mockImplementation((_process: StructureModel): Promise<StructureModel> =>
                Promise.resolve().then(() => new StructureModel()));
        const structureModel = new StructureModel();

        // WHEN
        const uc = new ConfigurationSynchronizeUC(synchronizeService);
        await uc.execute(structureModel);

        // THEN
        expect(synchronizeService.synchronize).toHaveBeenLastCalledWith(structureModel);
        expect(synchronizeService.synchronize).toBeTruthy();
        expect(synchronizeService.synchronize).toHaveBeenCalledTimes(1);
    });
});
