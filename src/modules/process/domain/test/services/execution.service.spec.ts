import { StructureInvalidError } from '@process/domain/errors/structure-invalid.error';
import { ExecutableAction, ExecutableMode, ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { ConfigurationService } from '@process/domain/services/configuration.service';
import { ProcessService } from '@process/domain/services/execution.service';
import { CreateExecution, CreateExecutionSequence, CreateExecutionSequenceNotExistConfig, CreateExecutionSequenceWithWrongModuleConfig } from './execution.model.spec-mock';
import { StructureRepositorySpecMock } from './structure.repository.spec-mock';

describe('Notification Service unit testing ', () => {

    afterEach(() => {
        jest.resetAllMocks();
    });

    it('Should execute process as cycle & check status IN_PROCESS/STOPPED', async () => {
        //GIVEN
        const structureRepository = new StructureRepositorySpecMock();
        const configurationService = new ConfigurationService(structureRepository);
        const notificationService = new ProcessService(configurationService);
        const execution = CreateExecution('1', ExecutableMode.FORCE, ExecutableAction.ON);

        //WHEN
        const isSuccess = await notificationService.execute(execution);
        //THEN
        expect(execution.task.status).toEqual(ExecutableStatus.IN_PROCCESS);
        expect(isSuccess).toBeTruthy();

        //WAIT
        await new Promise(resolve => setTimeout(resolve, 1000));
        //THEN
        expect(execution.task.status).toEqual(ExecutableStatus.STOPPED);
    });

    it('Should execute process as sequence & check status IN_PROCESS/STOPPED', async () => {
        //GIVEN
        const structureRepository = new StructureRepositorySpecMock();
        const configurationService = new ConfigurationService(structureRepository);
        const notificationService = new ProcessService(configurationService);
        const executionSequence = CreateExecutionSequence('1', ExecutableMode.FORCE, ExecutableAction.ON);

        //WHEN
        const isSuccess = await notificationService.execute(executionSequence);
        //THEN
        expect(executionSequence.task.status).toEqual(ExecutableStatus.IN_PROCCESS);
        expect(isSuccess).toBeTruthy();

        //WAIT
        await new Promise(resolve => setTimeout(resolve, 1000));
        //THEN
        expect(executionSequence.task.status).toEqual(ExecutableStatus.STOPPED);


    });

    it('Should return all notifications check conflicted', async () => {
        //GIVEN
        const structureRepository = new StructureRepositorySpecMock();
        const configurationService = new ConfigurationService(structureRepository);
        const notificationService = new ProcessService(configurationService);
        const execution = CreateExecution('1', ExecutableMode.FORCE, ExecutableAction.ON);
        const execution2 = CreateExecution('2', ExecutableMode.FORCE, ExecutableAction.ON);

        //WHEN
        const isSuccess = await notificationService.execute(execution);
        //THEN
        expect(execution.task.status).toEqual(ExecutableStatus.IN_PROCCESS);
        expect(isSuccess).toBeTruthy();

        const isSuccess2 = await notificationService.execute(execution2);
        expect(isSuccess2).toBeTruthy();
        expect(execution.task.status).toEqual(ExecutableStatus.STOPPED);

        //WAIT
        await new Promise(resolve => setTimeout(resolve, 1000));
        //THEN
        expect(execution2.task.status).toEqual(ExecutableStatus.STOPPED);
    });

    it('Should proccess queue mode', async () => {
        //GIVEN
        const structureRepository = new StructureRepositorySpecMock();
        const configurationService = new ConfigurationService(structureRepository);
        const notificationService = new ProcessService(configurationService);
        const execution = CreateExecution('1', ExecutableMode.QUEUED, ExecutableAction.ON);

        //WHEN

        try {
            await notificationService.execute(execution);
        } catch (e) {
            expect(e.message).toMatch('Method not implemented.');
        }
    });

    it('Should return all notifications check conflicted', async () => {
        //GIVEN
        const structureRepository = new StructureRepositorySpecMock();
        const configurationService = new ConfigurationService(structureRepository);
        const notificationService = new ProcessService(configurationService);
        const execution = CreateExecution('1', ExecutableMode.FORCE, ExecutableAction.ON);
        const execution2 = CreateExecution('2', ExecutableMode.FORCE, ExecutableAction.ON);
        const execution3 = CreateExecution('2', ExecutableMode.FORCE, ExecutableAction.ON);

        //WHEN
        const isSuccess = await notificationService.execute(execution);
        //THEN
        expect(execution.task.status).toEqual(ExecutableStatus.IN_PROCCESS);
        expect(isSuccess).toBeTruthy();

        const isSuccess2 = await notificationService.execute(execution2);
        expect(isSuccess2).toBeTruthy();
        expect(execution.task.status).toEqual(ExecutableStatus.STOPPED);

        const isSuccess3 = await notificationService.execute(execution3);
        expect(isSuccess3).toBeTruthy();
        expect(execution2.task.status).toEqual(ExecutableStatus.IN_PROCCESS); // because execution2 === execution3

        //WAIT
        await new Promise(resolve => setTimeout(resolve, 1000));
        //THEN
        expect(execution3.task.status).toEqual(ExecutableStatus.STOPPED);
    });

    it('Should fire error invalid Error struct', async () => {
        //GIVEN
        const structureRepository = new StructureRepositorySpecMock();
        const configurationService = new ConfigurationService(structureRepository);
        const notificationService = new ProcessService(configurationService);
        const execution = CreateExecutionSequenceNotExistConfig(ExecutableMode.FORCE, ExecutableAction.ON);
        try {
            //WHEN
            const isSuccess = await notificationService.execute(execution);
            //THEN
            expect(execution.task.status).toEqual(ExecutableStatus.IN_PROCCESS);
            expect(isSuccess).toBeTruthy();

            await new Promise(resolve => setTimeout(resolve, 1000));

            expect(execution.task.status).toEqual(ExecutableStatus.STOPPED);

        } catch (e) {
            expect(e).toBeInstanceOf(StructureInvalidError);
        }
    });

    it('Should catch async error on port configuration', async () => {
        //GIVEN
        const structureRepository = new StructureRepositorySpecMock();
        const configurationService = new ConfigurationService(structureRepository);
        const notificationService = new ProcessService(configurationService);
        const execution = CreateExecutionSequenceWithWrongModuleConfig(ExecutableMode.FORCE, ExecutableAction.ON);
        try {
            //WHEN
            const isSuccess = await notificationService.execute(execution);
            //THEN
            expect(execution.task.status).toEqual(ExecutableStatus.IN_PROCCESS);
            expect(isSuccess).toBeTruthy();

            await new Promise(resolve => setTimeout(resolve, 1000));

            expect(execution.task.status).toEqual(ExecutableStatus.STOPPED);

        } catch (e) {
            //expect(e).toBeInstanceOf(StructureInvalidError);
        }
    });

});
