import { ProcessExecuteDTO } from '@process/infrastructure/dto/process-execute.dto';
import { ExecutableAction, ExecutableStatus, ProcessMode, ProcessType } from '@process/domain/interfaces/executable.interface';

describe('ProcessExecuteDTO.mapToProcessModel', () => {
    function CreateDto(overrides: Partial<ProcessExecuteDTO> = {}): ProcessExecuteDTO {
        const dto = new ProcessExecuteDTO();
        dto._id = 'cycle-1';
        dto.action = ExecutableAction.ON;
        return Object.assign(dto, overrides);
    }

    it('should wrap the id into a stopped cycle stub and copy the action', () => {
        const model = ProcessExecuteDTO.mapToProcessModel(CreateDto());

        expect(model.cycle).toEqual(expect.objectContaining({ _id: 'cycle-1', status: ExecutableStatus.STOPPED }));
        expect(model.action).toEqual(ExecutableAction.ON);
    });

    it('should copy the optional mode/type/duration fields when provided', () => {
        const model = ProcessExecuteDTO.mapToProcessModel(CreateDto({
            mode: ProcessMode.MANUAL, type: ProcessType.FORCE, duration: 5000
        }));

        expect(model.mode).toEqual(ProcessMode.MANUAL);
        expect(model.type).toEqual(ProcessType.FORCE);
        expect(model.duration).toEqual(5000);
    });

    it('should leave the optional mode/type/duration fields undefined when absent', () => {
        const model = ProcessExecuteDTO.mapToProcessModel(CreateDto());

        expect(model.mode).toBeUndefined();
        expect(model.type).toBeUndefined();
        expect(model.duration).toBeUndefined();
    });
});
