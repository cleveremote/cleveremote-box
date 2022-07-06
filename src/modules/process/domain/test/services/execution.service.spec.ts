import { ExecutableAction, ExecutableMode } from '@process/domain/interfaces/executable.interface';
import { ConfigurationService } from '@process/domain/services/configuration.service';
import { ProcessService } from '@process/domain/services/execution.service';
import { CreateExecution, CreateExecutionSequence } from './execution.model.spec-mock';
import { StructureRepositorySpecMock } from './structure.repository.spec-mock';

describe('Notification Service unit testing ', () => {

    afterEach(() => {
        jest.resetAllMocks();
    });

    it('Should return all notifications', async () => {
        //GIVEN
        const structureRepository = new StructureRepositorySpecMock();
        const configurationService = new ConfigurationService(structureRepository);
        const notificationService = new ProcessService(configurationService);
        const execution = CreateExecution('1', ExecutableMode.FORCE, ExecutableAction.ON);
        const executionSequence = CreateExecutionSequence('1', ExecutableMode.FORCE, ExecutableAction.ON);


        //WHEN
        const isSuccess = await notificationService.execute(execution);

        //THEN
        expect(isSuccess).toBeTruthy();
    });

    it('execute sequence', async () => {
        //GIVEN
        const structureRepository = new StructureRepositorySpecMock();
        const configurationService = new ConfigurationService(structureRepository);
        const notificationService = new ProcessService(configurationService);
        const executionSequence = CreateExecutionSequence('1', ExecutableMode.FORCE, ExecutableAction.ON);

        //WHEN
        const isSuccess = await notificationService.execute(executionSequence);

        //THEN
        expect(isSuccess).toBeTruthy();
    });

    it('Should return all notifications not force', async () => {
        //GIVEN
        const structureRepository = new StructureRepositorySpecMock();
        const configurationService = new ConfigurationService(structureRepository);
        const notificationService = new ProcessService(configurationService);
        const execution = CreateExecution('2', ExecutableMode.NORMAL, ExecutableAction.ON);
        jest.spyOn(structureRepository, 'getCycles');
        jest.spyOn(structureRepository, 'getSequences');

        //WHEN
        const isSuccess = await notificationService.execute(execution);

        //THEN
        expect(isSuccess).toBeTruthy();
    });

    it('Should return all notifications check conflicted', async () => {
        //GIVEN
        const structureRepository = new StructureRepositorySpecMock();
        const configurationService = new ConfigurationService(structureRepository);
        const notificationService = new ProcessService(configurationService);
        const execution = CreateExecution('1', ExecutableMode.FORCE, ExecutableAction.ON);
        const execution2 = CreateExecution('2', ExecutableMode.FORCE, ExecutableAction.ON);

        //WHEN

        notificationService.execute(execution).then((response) => {
            expect(response).toBeTruthy();
        });

        notificationService.execute(execution2).then((response2) => {
            expect(response2).toBeTruthy();
        });
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
});
