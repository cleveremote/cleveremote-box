import { ConfigModule } from '@nestjs/config';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import { StructureService } from '@process/domain/services/configuration.service';
import { ProcessService } from '@process/domain/services/execution.service';
import { ScheduleService } from '@process/domain/services/schedule.service';
import { SynchronizeService } from '@process/domain/services/synchronize.service';
import { StructureSynchronizeDTO } from '@process/infrastructure/dto/configuration-synchronize.dto';
import { CycleSynchronizeDTO, ScheduleSynchronizeDTO } from '@process/infrastructure/dto/synchronize.dto';
import { SocketIoClientProxyService } from '../../../../../common/websocket/socket-io-client-proxy/socket-io-client-proxy.service';
import { SocketIoClientProvider } from '../../../../../common/websocket/socket-io-client.provider';
import { StructureRepositorySpecMock } from './structure.repository.spec-mock';
import {
    CreateDelSeqAndDelModuleDto,
    CreateNewScheduleDto,
    CreateNewScheduleDtowithPattern,
    CreateScheduleDeleteDto,
    CreateSynchronizePartialDeleteDto,
    CreateSynchronizePartialDto,
    CreateSynchronizePartialUpdateDto
} from './synchronize.dto.spec-mock';


describe('Synchronize Service unit testing ', () => {
    let synchronizeService: SynchronizeService;
    let configurationService: StructureService;
    afterEach(() => {
        jest.resetAllMocks();
    });

    beforeEach(async () => {

        const module: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot(),
                ScheduleModule.forRoot()],
            providers: [SocketIoClientProxyService, SocketIoClientProvider]
        }).compile();

        const schedulerRegistry: SchedulerRegistry = module.get<SchedulerRegistry>(SchedulerRegistry);
        const service: SocketIoClientProxyService = module.get<SocketIoClientProxyService>(SocketIoClientProxyService);
        const scheduleService = new ScheduleService(schedulerRegistry);

        const structureRepository = new StructureRepositorySpecMock();
        configurationService = new StructureService(structureRepository);
        const processService = new ProcessService(configurationService, service, scheduleService);
        await configurationService.getStructure();
        synchronizeService = new SynchronizeService(structureRepository, configurationService, processService, scheduleService);
    });

    it('Should save configuration', async () => {
        //GIVEN
        const dto = new StructureSynchronizeDTO();
        // eslint-disable-next-line max-len
        dto.configuration = '{"cycles":[{"status":"STOPPED","sequences":[{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":16,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":26,"direction":"out","edge":"both","instance":{}}],"id":"11","duration":10},{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":16,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":19,"direction":"out","edge":"both","instance":{}}],"id":"12","duration":10},{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":16,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":21,"direction":"out","edge":"both","instance":{}}],"id":"13","duration":10},{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":16,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":20,"direction":"out","edge":"both","instance":{}}],"id":"14","duration":10}],"id":"1"},{"status":"STOPPED","sequences":[{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":16,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":26,"direction":"out","edge":"both","instance":{}}],"id":"21","duration":10}],"id":"2"},{"status":"STOPPED","sequences":[{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":16,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":19,"direction":"out","edge":"both","instance":{}}],"id":"31","duration":10}],"id":"3"},{"status":"STOPPED","sequences":[{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":20,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":21,"direction":"out","edge":"both","instance":{}}],"id":"41","duration":10}],"id":"4"},{"status":"STOPPED","sequences":[{"status":"STOPPED","modules":[{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":20,"direction":"out","edge":"both","instance":{}},{"activeLow":false,"reconfigureDirection":true,"status":"OFF","portNum":20,"direction":"out","edge":"both","instance":{}}],"id":"51","duration":10}],"id":"5"}]}'
        const configurationModel = StructureSynchronizeDTO.mapToStructureModel(dto);

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
        await synchronizeService.sychronizePartial(configurationModel);

        //THEN
        expect(configurationService.structure.cycles.find(x => x.id === '1')).not.toBeDefined();
    });


    it('Should delete sequence & module from cycle ', async () => {

        //GIVEN
        const partialdto: CycleSynchronizeDTO = CreateDelSeqAndDelModuleDto();
        const configurationModel = CycleSynchronizeDTO.mapToCycleModel(partialdto);

        //WHEN
        await synchronizeService.sychronizePartial(configurationModel);

        //THEN
        expect(configurationService.sequences.find(x => x.id === '12')).not.toBeDefined();
        const module = configurationService.sequences.find(x => x.id === '11').modules.find(x => x.portNum === 26);
        expect(module).not.toBeDefined();
    });

    it('Should save new schedule', async () => {

        //GIVEN
        const scheduledto: ScheduleSynchronizeDTO = CreateNewScheduleDto();
        const scheduleSyncModel = ScheduleSynchronizeDTO.mapToScheduleModel(scheduledto);

        //WHEN
        const configModel = await synchronizeService.sychronizeSchedule(scheduleSyncModel);
        await new Promise(resolve => setTimeout(resolve, 3000));
        //THEN
        expect(configModel).toEqual(configurationService.structure.cycles.find(x => x.id === '1'));
    });


    it('Should delete schedule ', async () => {

        const scheduledto: ScheduleSynchronizeDTO = CreateNewScheduleDto();
        const scheduleSyncModel = ScheduleSynchronizeDTO.mapToScheduleModel(scheduledto);

        //WHEN
        const configModel = await synchronizeService.sychronizeSchedule(scheduleSyncModel);

        //THEN
        expect(configModel).toEqual(configurationService.structure.cycles.find(x => x.id === '1'));

        //GIVEN
        const scheduledtodelete: ScheduleSynchronizeDTO = CreateScheduleDeleteDto();
        const scheduleSyncModeldelete = ScheduleSynchronizeDTO.mapToScheduleModel(scheduledtodelete);

        //WHEN
        await synchronizeService.sychronizeSchedule(scheduleSyncModeldelete);

        //THEN
        expect(configurationService.structure.cycles.find(x => x.id === '1').schedules[0]).not.toBeDefined();
    });

    it('Should update schedule ', async () => {

        const scheduledto: ScheduleSynchronizeDTO = CreateNewScheduleDto();
        const scheduleSyncModel = ScheduleSynchronizeDTO.mapToScheduleModel(scheduledto);

        //WHEN
        const configModel = await synchronizeService.sychronizeSchedule(scheduleSyncModel);

        //THEN
        expect(configModel).toEqual(configurationService.structure.cycles.find(x => x.id === '1'));

        //GIVEN
        const scheduledtodelete: ScheduleSynchronizeDTO = CreateNewScheduleDto(true);
        const scheduleSyncModeldelete = ScheduleSynchronizeDTO.mapToScheduleModel(scheduledtodelete);

        //WHEN
        await synchronizeService.sychronizeSchedule(scheduleSyncModeldelete);

        //THEN
        expect(configurationService.structure.cycles.find(x => x.id === '1').schedules[0].name).toEqual('name-schedule1122_updated');
    });

    it('Should save new schedule', async () => {

        //GIVEN
        const scheduledto: ScheduleSynchronizeDTO = CreateNewScheduleDtowithPattern();
        const scheduleSyncModel = ScheduleSynchronizeDTO.mapToScheduleModel(scheduledto);

        //WHEN
        const configModel = await synchronizeService.sychronizeSchedule(scheduleSyncModel);
        await new Promise(resolve => setTimeout(resolve, 3000));
        //THEN
        expect(configModel).toEqual(configurationService.structure.cycles.find(x => x.id === '1'));
    });
    

});
