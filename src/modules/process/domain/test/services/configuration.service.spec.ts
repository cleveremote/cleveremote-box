import { StructureService } from '@process/domain/services/configuration.service';
import { StructureRepositorySpecMock } from './structure.repository.spec-mock';

describe('Notification Service unit testing ', () => {
    let configurationService: StructureService;
    afterEach(() => {
        jest.resetAllMocks();
    });

    beforeEach(async () => {
        const structureRepository = new StructureRepositorySpecMock();
        configurationService = new StructureService(structureRepository);
    });

    it('Should get configuration', async () => {
        //WHEN
        const configuration = await configurationService.getStructure();
        //THEN
        expect(configuration).toBeDefined();
    });
});
