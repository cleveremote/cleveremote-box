import { ConfigurationService } from '@process/domain/services/configuration.service';
import { SynchronizeService } from '@process/domain/services/synchronize.service';
import { ConfigurationSynchronizeDTO } from '@process/infrastructure/dto/configuration-synchronize.dto';
import { CycleSynchronizeDTO } from '@process/infrastructure/dto/synchronize.dto';
import { ConfigurationRepository } from '@process/infrastructure/repositories/configuration.repository';
import { StructureRepositorySpecMock } from './structure.repository.spec-mock';
import { CreateDelSeqAndDelModuleDto, CreateSynchronizePartialDeleteDto, CreateSynchronizePartialDto, CreateSynchronizePartialUpdateDto } from './synchronize.dto.spec-mock';


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
        //GIVEN
        const dto = new ConfigurationSynchronizeDTO();
        //WHEN
        const configuration = await configurationService.getConfiguration();
        //THEN
        expect(configuration).toBeDefined();
    });
});
