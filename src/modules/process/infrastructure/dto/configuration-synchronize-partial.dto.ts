// import { ApiProperty } from '@nestjs/swagger';
// import { SynchronizeAction, SynchronizeType } from '@process/domain/interfaces/synchronize.interface';
// import { StructureModel } from '@process/domain/models/structure.model';
// import { Type } from 'class-transformer';
// import { IsEnum, IsNotEmpty, isObject, IsString } from 'class-validator';
// import { StructureEntity } from '../entities/structure.entity';

// export class style{
//      bgColor: string; 
//      fontColor: string; 
//      iconColor: string 
// }

// export class ConfigurationSynchronizePartialDTO {

//     @IsNotEmpty()
//     @IsString()
//     @ApiProperty()
//     public id: string;

//     @IsEnum(SynchronizeAction)
//     @IsNotEmpty()
//     @ApiProperty()
//     public action: SynchronizeAction;

//     @IsEnum(SynchronizeType)
//     @IsNotEmpty()
//     @ApiProperty()
//     public type: SynchronizeType;

//     @IsString()
//     @ApiProperty()
//     public function: string;

//     @IsNumber()
//     @ApiProperty()
//     public duration: number;
    
//     @IsString()
//     @ApiProperty()
//     public id: string;
//     @IsString()
//     @ApiProperty()
//     public name: string;
//     @IsString()
//     @ApiProperty()
//     public description?: string;
//     @Type(() => style)
//     @ApiProperty({})
//     public style?: { bgColor: string; fontColor: string; iconColor: string };
    
//     public status: ExecutableStatus = ExecutableStatus.STOPPED;
//     public progression?: { startedAt: Date; duration: number };
//     public sequences: SequenceModel[] = [];
    

//     public id: string;
//     public name: string;
//     public description?: string;
//     public status: ExecutableStatus = ExecutableStatus.STOPPED;
//     public progression?: { startedAt: Date; duration: number };
//     public duration: number;
//     public modules: ModuleModel[] = [];



//     public static mapToNotificationModel(notificationCreateDTO: ConfigurationSynchronizeDTO): StructureModel {
//         return StructureEntity.mapToStructureModel(notificationCreateDTO);
//     }
// }

