import { ExecutionController } from '@process/infrastructure/controllers/execution.controller';
import { ProcessService } from '@process/domain/services/execution.service';
import { ProcessExecuteDTO } from '@process/infrastructure/dto/process-execute.dto';
import { ExecutableAction } from '@process/domain/interfaces/executable.interface';

describe('ExecutionController', () => {
    let processService: { execute: jest.Mock; applyInverterConfig: jest.Mock };
    let controller: ExecutionController;

    beforeEach(() => {
        processService = { execute: jest.fn(), applyInverterConfig: jest.fn() };
        controller = new ExecutionController(processService as unknown as ProcessService);
    });

    describe('handleSendHello', () => {
        it('should map the DTO and return true when execution succeeds', async () => {
            processService.execute.mockResolvedValue(undefined);
            const dto = Object.assign(new ProcessExecuteDTO(), { id: 'cycle-1', action: ExecutableAction.ON });

            const isSuccessful = await controller.handleSendHello(dto);

            expect(isSuccessful).toBe(true);
            expect(processService.execute).toHaveBeenCalledWith(expect.objectContaining({ action: ExecutableAction.ON }));
        });

        it('should return false instead of throwing when execution fails', async () => {
            processService.execute.mockRejectedValue(new Error('boom'));
            const dto = Object.assign(new ProcessExecuteDTO(), { id: 'cycle-1', action: ExecutableAction.OFF });

            const isSuccessful = await controller.handleSendHello(dto);

            expect(isSuccessful).toBe(false);
        });
    });

    describe('handleInverterConfig', () => {
        it('should delegate to ProcessService.applyInverterConfig and return true on success', async () => {
            processService.applyInverterConfig.mockResolvedValue(undefined);

            const isSuccessful = await controller.handleInverterConfig({ inverterId: 'inverter-1', params: [{ param: 'F00.11', value: 42 }] });

            expect(isSuccessful).toBe(true);
            expect(processService.applyInverterConfig).toHaveBeenCalledWith('inverter-1', [{ param: 'F00.11', value: 42 }]);
        });

        it('should return false instead of throwing when applyInverterConfig fails', async () => {
            processService.applyInverterConfig.mockRejectedValue(new Error('boom'));

            const isSuccessful = await controller.handleInverterConfig({ inverterId: 'inverter-1', params: [] });

            expect(isSuccessful).toBe(false);
        });
    });
});
