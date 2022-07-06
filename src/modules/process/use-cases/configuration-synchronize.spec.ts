import { MockClass } from '@framework/utils/test.utils';
import { StructureModel } from '@process/domain/models/structure.model';
import { ConfigurationService } from '@process/domain/services/configuration.service';
import { ConfigurationSynchronizeUC } from './configuration-synchronize.uc';

describe('Process use case test', () => {
    it('Should execute process and return a response dto', async () => {
        // GIVEN
        const configurationService = MockClass(ConfigurationService);
        jest.spyOn(configurationService, 'synchronize')
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .mockImplementation((_process: StructureModel): Promise<StructureModel> =>
                Promise.resolve().then(() => new StructureModel()));
        const structureModel = new StructureModel();

        // WHEN
        const uc = new ConfigurationSynchronizeUC(configurationService);
        await uc.execute(structureModel);

        // THEN
        expect(configurationService.synchronize).toHaveBeenLastCalledWith(structureModel);
        expect(configurationService.synchronize).toBeTruthy();
        expect(configurationService.synchronize).toHaveBeenCalledTimes(1);
    });
});
