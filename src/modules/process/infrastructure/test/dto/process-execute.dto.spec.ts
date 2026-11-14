import { ProcessExecuteDTO, ProcessExecuteType } from '@process/infrastructure/dto/process-execute.dto';
import { ExecutableAction, ExecutableStatus, ProcessMode, SequenceCommand, StartPolicy } from '@process/domain/interfaces/executable.interface';

describe('ProcessExecuteDTO', () => {
    function CreateDto(overrides: Partial<ProcessExecuteDTO> = {}): ProcessExecuteDTO {
        const dto = new ProcessExecuteDTO();
        dto._id = 'cycle-1';
        dto.action = ExecutableAction.ON;
        return Object.assign(dto, overrides);
    }

    describe('mapToProcessModel', () => {
        it('should wrap the id into a stopped cycle stub and copy the action', () => {
            const model = ProcessExecuteDTO.mapToProcessModel(CreateDto());

            expect(model.cycle).toEqual(expect.objectContaining({ _id: 'cycle-1', status: ExecutableStatus.STOPPED }));
            expect(model.action).toEqual(ExecutableAction.ON);
        });

        it('should copy the optional mode/duration fields and translate the type when provided', () => {
            const model = ProcessExecuteDTO.mapToProcessModel(CreateDto({
                mode: ProcessMode.MANUAL, type: ProcessExecuteType.FORCE, duration: 5000
            }));

            expect(model.mode).toEqual(ProcessMode.MANUAL);
            expect(model.policy).toEqual(StartPolicy.FORCE);
            expect(model.duration).toEqual(5000);
        });

        it.each([
            [ProcessExecuteType.INIT, StartPolicy.ARBITRATE],
            [ProcessExecuteType.FORCE, StartPolicy.FORCE],
            [ProcessExecuteType.QUEUED, StartPolicy.QUEUE]
        ])('should translate type %s into policy %s', (type, policy) => {
            expect(ProcessExecuteDTO.mapToProcessModel(CreateDto({ type })).policy).toEqual(policy);
        });

        it('should turn IGNORE (confirmation refused) into a forced OFF', () => {
            const model = ProcessExecuteDTO.mapToProcessModel(CreateDto({ type: ProcessExecuteType.IGNORE }));

            expect(model.action).toEqual(ExecutableAction.OFF);
            expect(model.policy).toEqual(StartPolicy.FORCE);
        });

        it('should leave the optional mode/policy/duration fields undefined when absent', () => {
            const model = ProcessExecuteDTO.mapToProcessModel(CreateDto());

            expect(model.mode).toBeUndefined();
            expect(model.policy).toBeUndefined();
            expect(model.duration).toBeUndefined();
        });
    });

    describe('mapToSequenceCommand', () => {
        it('should translate SKIP / FORCE_SEQUENCE into sequence commands', () => {
            expect(ProcessExecuteDTO.mapToSequenceCommand(CreateDto({ type: ProcessExecuteType.SKIP }))).toEqual(SequenceCommand.SKIP);
            expect(ProcessExecuteDTO.mapToSequenceCommand(CreateDto({ type: ProcessExecuteType.FORCE_SEQUENCE }))).toEqual(SequenceCommand.FORCE);
        });

        it('should return undefined for a cycle command', () => {
            expect(ProcessExecuteDTO.mapToSequenceCommand(CreateDto({ type: ProcessExecuteType.FORCE }))).toBeUndefined();
        });
    });
});
