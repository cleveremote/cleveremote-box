import { MockClass } from '@framework/utils/test.utils';
import { ProcessModel } from '@process/domain/models/process.model';
import { ProcessService } from '@process/domain/services/execution.service';
import { ProcessExecuteUC } from './process-execute.uc';

describe('Process use case test', () => {
    it('Should execute process and return a response dto', async () => {
        // GIVEN
        const processService = MockClass(ProcessService);
        jest.spyOn(processService, 'execute')
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .mockImplementation((_process: ProcessModel): Promise<void> =>
                Promise.resolve());
        const processModel = new ProcessModel();

        // WHEN
        const uc = new ProcessExecuteUC(processService);
        await uc.execute(processModel);

        // THEN
        expect(processService.execute).toHaveBeenLastCalledWith(processModel);
        expect(processService.execute).toBeTruthy();
        expect(processService.execute).toHaveBeenCalledTimes(1);
    });

});
