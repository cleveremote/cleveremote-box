import { MockClass } from '@framework/utils/test.utils';
import { StructureModel } from '@process/domain/models/structure.model';
import { StructureService } from '@process/domain/services/configuration.service';
import { ConfigurationFetchUC } from './configuration-fetch.uc';

describe('Process use case test', () => {
    it('Should execute process and return a response dto', async () => {
        // GIVEN
        const configurationService = MockClass(StructureService);
        jest.spyOn(configurationService, 'getConfiguration')
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .mockImplementation((): Promise<StructureModel> =>
                Promise.resolve().then(() => new StructureModel()));
        // WHEN
        const uc = new ConfigurationFetchUC(configurationService);
        await uc.execute();

        // THEN
        expect(configurationService.getStructure).toBeTruthy();
        expect(configurationService.getStructure).toHaveBeenCalledTimes(1);
    });
});
