import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { StructureService } from '@process/domain/services/configuration.service';
import { ProcessService } from '@process/domain/services/execution.service';
import { InitService } from '@process/domain/services/init.service';
import { SocketIoClientProvider } from '../../../../../common/websocket/socket-io-client.provider';
import { SocketIoClientProxyService } from '../../../../../common/websocket/socket-io-client-proxy/socket-io-client-proxy.service';
import { StructureRepositorySpecMock } from './structure.repository.spec-mock';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { ScheduleService } from '@process/domain/services/schedule.service';

describe.only('Notification Service unit testing ', () => {
    let configurationService: StructureService;
    let processService: ProcessService;
    let initService: InitService;
    let service: SocketIoClientProxyService;
    let scheduleService: ScheduleService;
    afterEach(() => {
        jest.resetAllMocks();
    });

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot(),
                ScheduleModule.forRoot()
            ],
            providers: [SocketIoClientProxyService, SocketIoClientProvider]
        }).compile();

        const schedulerRegistry = module.get<SchedulerRegistry>(SchedulerRegistry);
        scheduleService = new ScheduleService(schedulerRegistry);
        service = module.get<SocketIoClientProxyService>(SocketIoClientProxyService);

    });

    it('Should initialize module process', async () => {

        //GIVEN
        const structureRepository = new StructureRepositorySpecMock();
        configurationService = new StructureService(structureRepository);
        processService = new ProcessService(configurationService, service, scheduleService);
        initService = new InitService(configurationService, processService);

        //WHEN
        await initService.initialize();

        //THEN
        expect(configurationService.structure).toBeDefined();
        configurationService.structure.cycles.forEach((cycle) => {
            expect(cycle.status).toEqual(ExecutableStatus.STOPPED);
        });

    });

    it('Should fail module process', async () => {

        //GIVEN
        const structureRepository = new StructureRepositorySpecMock(1);
        configurationService = new StructureService(structureRepository);
        processService = new ProcessService(configurationService, service, scheduleService);
        initService = new InitService(configurationService, processService);

        //WHEN
        const isSuccess = await initService.initialize();

        //THEN
        expect(isSuccess).toBeFalsy();

    });

    it('Should fail module process cause resetAll ', async () => {

        //GIVEN
        const structureRepository = new StructureRepositorySpecMock(2);
        configurationService = new StructureService(structureRepository);
        processService = new ProcessService(configurationService, service, scheduleService);
        initService = new InitService(configurationService, processService);

        //WHEN
        const isSuccess = await initService.initialize();

        //THEN
        expect(isSuccess).toBeFalsy();

    });
});
