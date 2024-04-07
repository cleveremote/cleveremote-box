import { ApiProperty } from '@nestjs/swagger';
import { ProcessType, ExecutableAction, ProcessMode, ExecutableStatus, IExecutable } from '@process/domain/interfaces/executable.interface';
import { CycleModel } from '@process/domain/models/cycle.model';
import { ProcessModel } from '@process/domain/models/process.model';
import { IsEnum, IsNotEmpty, IsNumber, IsString } from 'class-validator';


export enum USER_ENS_TYPE {
    CA = '499',
    CS = '993',
    CM = '400'
}
export class ProcessExecuteDTO {

    @IsNotEmpty()
    @IsString()
    @ApiProperty()
    public id: string;

    @IsEnum(ExecutableAction)
    @IsNotEmpty()
    @ApiProperty()
    public action: ExecutableAction;

    @IsEnum(ProcessType)
    @IsNotEmpty()
    @ApiProperty()
    public type: ProcessType;

    @IsEnum(ProcessMode)
    @IsNotEmpty()
    @ApiProperty()
    public mode: ProcessMode;

    @IsString()
    @ApiProperty()
    public function: string;

    @IsNumber()
    @ApiProperty()
    public duration: number;

    public static mapToProcessModel(notificationCreateDTO: ProcessExecuteDTO): ProcessModel {
        const process = new ProcessModel();
        process.cycle = { id: notificationCreateDTO.id, status: ExecutableStatus.STOPPED } as CycleModel ;
        process.action = notificationCreateDTO.action;
        process.mode = notificationCreateDTO.mode;
        process.type = notificationCreateDTO.type;
        process.duration = notificationCreateDTO.duration;
        return process;
    }
}

