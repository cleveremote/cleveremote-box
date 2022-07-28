import { ConfigurationService } from '@process/domain/services/configuration.service';
import { SynchronizeService } from '@process/domain/services/synchronize.service';
import { ConfigurationSynchronizeDTO } from '@process/infrastructure/dto/configuration-synchronize.dto';
import { CycleSynchronizeDTO } from '@process/infrastructure/dto/synchronize.dto';
import { ConfigurationRepository } from '@process/infrastructure/repositories/configuration.repository';
import { StructureRepositorySpecMock } from './structure.repository.spec-mock';
import { CreateDelSeqAndDelModuleDto, CreateSynchronizePartialDeleteDto, CreateSynchronizePartialDto, CreateSynchronizePartialUpdateDto } from './synchronize.dto.spec-mock';


describe('Synchronize Service unit testing ', () => {
    let synchronizeService: SynchronizeService;
    let configurationService: ConfigurationService;
    afterEach(() => {
        jest.resetAllMocks();
    });

    beforeEach(async () => {
        const structureRepository = new StructureRepositorySpecMock();
        configurationService = new ConfigurationService(structureRepository);
        await configurationService.getConfiguration();
        synchronizeService = new SynchronizeService(structureRepository, configurationService);
    });

    it('Should save configuration', async () => {
        //GIVEN
        const dto = new ConfigurationSynchronizeDTO();
        // eslint-disable-next-line max-len
        dto.configuration = '{"cycles":[{"status":"STOPPED","sequences":[{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":16,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":26,"direction":"out","edge":"both","instance":{}}],"id":"11","duration":10},{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":16,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":19,"direction":"out","edge":"both","instance":{}}],"id":"12","duration":10},{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":16,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":21,"direction":"out","edge":"both","instance":{}}],"id":"13","duration":10},{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":16,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":20,"direction":"out","edge":"both","instance":{}}],"id":"14","duration":10}],"id":"1"},{"status":"STOPPED","sequences":[{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":16,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":26,"direction":"out","edge":"both","instance":{}}],"id":"21","duration":10}],"id":"2"},{"status":"STOPPED","sequences":[{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":16,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":19,"direction":"out","edge":"both","instance":{}}],"id":"31","duration":10}],"id":"3"},{"status":"STOPPED","sequences":[{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":20,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":21,"direction":"out","edge":"both","instance":{}}],"id":"41","duration":10}],"id":"4"},{"status":"STOPPED","sequences":[{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":20,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":20,"direction":"out","edge":"both","instance":{}}],"id":"51","duration":10}],"id":"5"}]}'
        const configurationModel = ConfigurationSynchronizeDTO.mapToNotificationModel(dto);

        //WHEN
        const configModel = await synchronizeService.synchronize(configurationModel);

        //THEN
        expect(configModel).toEqual(configurationModel);
    });

    it('Should save new cycle as partial configuration', async () => {

        //GIVEN
        const partialdto: CycleSynchronizeDTO = CreateSynchronizePartialDto();
        const configurationModel = CycleSynchronizeDTO.mapToCycleModel(partialdto);

        //WHEN
        const configModel = await synchronizeService.sychronizePartial(configurationModel);

        //THEN
        expect(configModel).toEqual(configurationService.structure.cycles.find(x => x.id === 'partial1'));
    });

    it('Should update cycle & sequence child as partial configuration', async () => {

        //GIVEN
        const partialdto: CycleSynchronizeDTO = CreateSynchronizePartialUpdateDto();
        const configurationModel = CycleSynchronizeDTO.mapToCycleModel(partialdto);

        //WHEN
        const configModel = await synchronizeService.sychronizePartial(configurationModel);

        //THEN
       expect(configModel).toEqual(configurationService.structure.cycles.find(x => x.id === '1'));
    });

    it('Should delete cycle ', async () => {

        //GIVEN
        const partialdto: CycleSynchronizeDTO = CreateSynchronizePartialDeleteDto();
        const configurationModel = CycleSynchronizeDTO.mapToCycleModel(partialdto);

        //WHEN
        const configModel = await synchronizeService.sychronizePartial(configurationModel);

        //THEN
        expect(configurationService.structure.cycles.find(x => x.id === '1')).not.toBeDefined();
    });


    it('Should delete sequence & module from cycle ', async () => {

        //GIVEN
        const partialdto: CycleSynchronizeDTO = CreateDelSeqAndDelModuleDto();
        const configurationModel = CycleSynchronizeDTO.mapToCycleModel(partialdto);

        //WHEN
        const configModel = await synchronizeService.sychronizePartial(configurationModel);

        //THEN
        expect(configurationService.sequences.find(x => x.id === '12')).not.toBeDefined();
        const module = configurationService.sequences.find(x => x.id === '11').modules.find(x => x.portNum === 26);
        expect(module).not.toBeDefined();
    });
});
