import { ConfigurationService } from '@process/domain/services/configuration.service';
import { StructureRepositorySpecMock } from './structure.repository.spec-mock';

describe('Notification Service unit testing ', () => {
    let configurationService: ConfigurationService;
    afterEach(() => {
        jest.resetAllMocks();
    });

    beforeEach(async () => {
        const structureRepository = new StructureRepositorySpecMock();
        configurationService = new ConfigurationService(structureRepository);
    });

    it('Should get configuration', async () => {
        //WHEN
        const configuration = await configurationService.getConfiguration();
        //THEN
        expect(configuration).toBeDefined();
    });
});
