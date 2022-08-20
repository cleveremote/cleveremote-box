import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { StructureInvalidError } from '@process/domain/errors/structure-invalid.error';
import { ExecutableAction, ProcessMode, ExecutableStatus, ProcessType } from '@process/domain/interfaces/executable.interface';
import { ConfigurationService } from '@process/domain/services/configuration.service';
import { ProcessService } from '@process/domain/services/execution.service';
import { SocketIoClientProvider } from '../../../../../common/websocket/socket-io-client.provider';
import { SocketIoClientProxyService } from '../../../../../common/websocket/socket-io-client-proxy/socket-io-client-proxy.service';
import { CreateExecution, CreateExecutionCycleNotExistConfig, CreateExecutionCycleWithWrongModuleConfig, CreateExecutionQueued } from './execution.model.spec-mock';
import { StructureRepositorySpecMock } from './structure.repository.spec-mock';
import { ScheduleService } from '@process/domain/services/schedule.service';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';

describe('Notification Service unit testing ', () => {
    let notificationService: ProcessService;

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

        const service: SocketIoClientProxyService = module.get<SocketIoClientProxyService>(SocketIoClientProxyService);
        const schedulerRegistry: SchedulerRegistry = module.get<SchedulerRegistry>(SchedulerRegistry);

        const scheduleService = new ScheduleService(schedulerRegistry);
        const structureRepository = new StructureRepositorySpecMock();
        const configurationService = new ConfigurationService(structureRepository);
        await configurationService.getConfiguration();
        notificationService = new ProcessService(configurationService, service, scheduleService);
        await notificationService.resetAllModules();
    });

    it('Should execute process & check status IN_PROCESS/STOPPED', async () => {
        //GIVEN
        const execution = CreateExecution('1', ProcessMode.MANUAL, ExecutableAction.ON);

        //WHEN
        await notificationService.execute(execution);

        //THEN
        expect(execution.cycle.status).toEqual(ExecutableStatus.IN_PROCCESS);

        //THEN
        await new Promise(resolve => setTimeout(resolve, 1000));
        expect(execution.cycle.status).toEqual(ExecutableStatus.STOPPED);
    });

    it('Should switch process ON/OFF', async () => {
        //GIVEN
        const execution = CreateExecution('1', ProcessMode.MANUAL, ExecutableAction.ON);
        const execution2 = CreateExecution('1', ProcessMode.MANUAL, ExecutableAction.OFF);

        //WHEN
        await notificationService.execute(execution);

        //THEN
        expect(execution.cycle.status).toEqual(ExecutableStatus.IN_PROCCESS);

        await notificationService.execute(execution2);

        await new Promise(resolve => setTimeout(resolve, 1000));
        //THEN
        expect(execution.cycle.status).toEqual(ExecutableStatus.STOPPED);
        expect(execution2.cycle.status).toEqual(ExecutableStatus.STOPPED);

    });

    it('Should manage conflicted processes', async () => {
        //GIVEN
        const execution = CreateExecution('1', ProcessMode.MANUAL, ExecutableAction.ON);
        const execution2 = CreateExecution('2', ProcessMode.MANUAL, ExecutableAction.ON);

        //WHEN
        await notificationService.execute(execution);
        //THEN
        expect(execution.cycle.status).toEqual(ExecutableStatus.IN_PROCCESS);

        await notificationService.execute(execution2);
        expect(execution.cycle.status).toEqual(ExecutableStatus.STOPPED);

        //WAIT
        await new Promise(resolve => setTimeout(resolve, 1000));
        //THEN
        expect(execution2.cycle.status).toEqual(ExecutableStatus.STOPPED);
    });

    it('Should execute proccess in queue mode', async () => {
        //GIVEN
        const execution = CreateExecutionQueued('1', ProcessMode.MANUAL, ExecutableAction.ON);

        //WHEN
        try {
            await notificationService.execute(execution);
        } catch (e) {
            expect(e.message).toMatch('Method not implemented.');
        }
    });

    it('Should return all notifications check conflicted', async () => {
        //GIVEN
        const execution = CreateExecution('1', ProcessMode.MANUAL, ExecutableAction.ON);
        const execution2 = CreateExecution('2', ProcessMode.MANUAL, ExecutableAction.ON);
        const execution3 = CreateExecution('2', ProcessMode.MANUAL, ExecutableAction.ON);

        //WHEN
        await notificationService.execute(execution);
        //THEN
        expect(execution.cycle.status).toEqual(ExecutableStatus.IN_PROCCESS);

        await notificationService.execute(execution2);
        expect(execution.cycle.status).toEqual(ExecutableStatus.STOPPED);

        await notificationService.execute(execution3);
        expect(execution2.cycle.status).toEqual(ExecutableStatus.IN_PROCCESS); // because execution2 === execution3

        //WAIT
        await new Promise(resolve => setTimeout(resolve, 1000));
        //THEN
        expect(execution3.cycle.status).toEqual(ExecutableStatus.STOPPED);
    });

    it('Should fire error invalid Error struct', async () => {
        //GIVEN
        const execution = CreateExecutionCycleNotExistConfig(ProcessMode.MANUAL, ExecutableAction.ON);
        //WHEN
        await notificationService.execute(execution).catch((error) => expect(error).toBeInstanceOf(StructureInvalidError));

    });

    it('Should manage async error on port configuration', async () => {
        //GIVEN
        const execution = CreateExecutionCycleWithWrongModuleConfig(ProcessMode.MANUAL, ExecutableAction.ON);

        //WHEN
        await notificationService.execute(execution);

        //THEN
        await new Promise(resolve => setTimeout(resolve, 1000));
        expect(execution.cycle.status).toEqual(ExecutableStatus.STOPPED);
    });

});
