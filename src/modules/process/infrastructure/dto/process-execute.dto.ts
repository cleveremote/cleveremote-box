import { ApiProperty } from '@nestjs/swagger';
import { ConditionType, ExecutableAction, ExecutableMode, ExecutableStatus, IExecutable } from '@process/domain/interfaces/executable.interface';
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

    @IsEnum(ConditionType)
    @IsNotEmpty()
    @ApiProperty()
    public type: ConditionType;

    @IsEnum(ExecutableMode)
    @IsNotEmpty()
    @ApiProperty()
    public mode: ExecutableMode;

    @IsString()
    @ApiProperty()
    public function: string;

    @IsNumber()
    @ApiProperty()
    public duration: number;

    public static mapToProcessModel(notificationCreateDTO: ProcessExecuteDTO): ProcessModel {
        const process = new ProcessModel();
        process.cycle = { id: notificationCreateDTO.id, status: ExecutableStatus.STOPPED } as IExecutable ;
        process.action = notificationCreateDTO.action;
        process.function = notificationCreateDTO.function;
        process.mode = notificationCreateDTO.mode;
        process.type = notificationCreateDTO.type;
        process.duration = notificationCreateDTO.duration;
        return process;
    }
}

