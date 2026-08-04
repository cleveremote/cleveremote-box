import { MockClass } from '@framework/utils/test.utils';
import { ValueModel } from '@process/domain/models/value.model';
import { StructureService } from '@process/domain/services/configuration.service';
import { ValuesFetchUC } from './values-fetch.uc';

describe('Process use case test', () => {
    it('Should execute status fetch and return a response dto', async () => {
        // GIVEN
        const configurationService = MockClass(StructureService);
        const valueModel = new ValueModel();
        jest.spyOn(configurationService, 'getStatus')
            .mockImplementation((_type: string): Promise<ValueModel> => Promise.resolve(valueModel));

        // WHEN
        const uc = new ValuesFetchUC(configurationService);
        const result = await uc.execute('CYCLE');

        // THEN
        expect(configurationService.getStatus).toHaveBeenLastCalledWith('CYCLE');
        expect(configurationService.getStatus).toHaveBeenCalledTimes(1);
        expect(result).toBe(valueModel);
    });
});
