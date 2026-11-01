import { ApiProperty } from '@nestjs/swagger';
import { ExecutableAction, ProcessMode, ExecutableStatus, SequenceCommand, StartPolicy } from '@process/domain/interfaces/executable.interface';
import { CycleModel } from '@process/domain/models/cycle.model';
import { ProcessModel } from '@process/domain/models/process.model';
import { ExecutableType } from '@process/domain/models/value.model';
import { EventSource, StopReason } from '@process/domain/models/event.model';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';


export enum USER_ENS_TYPE {
    CA = '499',
    CS = '993',
    CM = '400'
}
// valeurs de "type" envoyees par le front (protocole inchange)
export enum ProcessExecuteType {
    INIT = 'INIT', // demarrage arbitre par les rangs
    FORCE = 'FORCE', // demarrage force (ou acceptation d'une confirmation)
    QUEUED = 'QUEUED', // reponse a une confirmation : attendre la fin des conflits
    IGNORE = 'IGNORE', // reponse a une confirmation : abandonner
    SKIP = 'SKIP',
    FORCE_SEQUENCE = 'FORCE_SEQUENCE'
}

const POLICY_BY_TYPE: Partial<Record<ProcessExecuteType, StartPolicy>> = {
    [ProcessExecuteType.INIT]: StartPolicy.ARBITRATE,
    [ProcessExecuteType.FORCE]: StartPolicy.FORCE,
    [ProcessExecuteType.QUEUED]: StartPolicy.QUEUE,
    [ProcessExecuteType.IGNORE]: StartPolicy.FORCE
};

const SEQUENCE_COMMAND_BY_TYPE: Partial<Record<ProcessExecuteType, SequenceCommand>> = {
    [ProcessExecuteType.SKIP]: SequenceCommand.SKIP,
    [ProcessExecuteType.FORCE_SEQUENCE]: SequenceCommand.FORCE
};

export class ProcessExecuteDTO {

    @IsNotEmpty()
    @IsString()
    @ApiProperty()
    public _id: string;

    @IsEnum(ExecutableAction)
    @IsNotEmpty()
    @ApiProperty()
    public action: ExecutableAction;

    @IsEnum(ExecutableType)
    @IsOptional()
    @ApiProperty({ enum: ExecutableType, required: false, default: ExecutableType.CYCLE })
    public executableType?: ExecutableType;

    @IsEnum(ProcessExecuteType)
    @IsOptional()
    @ApiProperty({ enum: ProcessExecuteType, required: false })
    public type?: ProcessExecuteType;

    @IsEnum(ProcessMode)
    @IsOptional()
    @ApiProperty({ required: false })
    public mode?: ProcessMode;

    @IsString()
    @IsOptional()
    @ApiProperty({ required: false })
    public function?: string;

    @IsNumber()
    @IsOptional()
    @ApiProperty({ required: false })
    public duration?: number;

    // utilisateur a l'origine de l'ordre (journal d'execution)
    @IsString()
    @IsOptional()
    @ApiProperty({ required: false })
    public requestedBy?: string;

    // valeurs historiques du front traduites en consigne de demarrage ; IGNORE (refus d'une
    // confirmation) = arret, qui annule l'attente du cycle (cf. ProcessService._cancelPendingConfirmation)
    public static mapToProcessModel(processExecuteDTO: ProcessExecuteDTO): ProcessModel {
        const process = new ProcessModel();
        process.cycle = new CycleModel();
        process.cycle._id = processExecuteDTO._id;
        process.cycle.status = ExecutableStatus.STOPPED;
        process.action = processExecuteDTO.type === ProcessExecuteType.IGNORE ? ExecutableAction.OFF : processExecuteDTO.action;
        process.mode = processExecuteDTO.mode;
        process.policy = POLICY_BY_TYPE[processExecuteDTO.type];
        process.duration = processExecuteDTO.duration;
        process.origin = { source: EventSource.MANUAL, requestedBy: processExecuteDTO.requestedBy };
        if (processExecuteDTO.type === ProcessExecuteType.IGNORE) {
            process.stop = { reason: StopReason.CONFIRMATION_REFUSED };
        }
        return process;
    }

    // SKIP / FORCE_SEQUENCE visent une sequence (_id = id de sequence), pas un cycle
    public static mapToSequenceCommand(processExecuteDTO: ProcessExecuteDTO): SequenceCommand | undefined {
        return SEQUENCE_COMMAND_BY_TYPE[processExecuteDTO.type];
    }
}
