/* eslint-disable max-lines-per-function */
import { ApiProperty } from '@nestjs/swagger';
import { SynchronizeAction, SynchronizeType } from '@process/domain/interfaces/synchronize.interface';
import { CycleModel } from '@process/domain/models/cycle.model';
import { ModuleModel } from '@process/domain/models/module.model';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { SynchronizeCycleModel, SynchronizeModuleModel, SynchronizeSequenceModel } from '@process/domain/models/synchronize.model';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNotEmpty, isNumber, IsNumber, IsString } from 'class-validator';
import { StructureEntity } from '../entities/structure.entity';

export class Sequence {
    @IsString()
    @IsNotEmpty()
    public id: string;
    @IsString()
    public name: string;
    @IsString()
    public description: string;
    @IsNumber()
    public duration: number;
    @IsArray()
    @Type(() => String)
    public modules: string[];
}
export class SequenceSync {
    @Type(() => Sequence)
    @IsNotEmpty()
    public sequence?: Sequence;

    @IsEnum(SynchronizeAction)
    @IsNotEmpty()
    public action: SynchronizeAction
}

export class Style {
    @IsString()
    public bgColor: string;
    @IsString()
    public fontColor: string;
    @IsString()
    public iconColor: string
}

export class CycleSynchronizeDTO {
    @IsNotEmpty()
    public id: string;
    @IsString()
    public name?: string;
    @IsString()
    public description: string;
    @Type(() => Style)
    public style?: Style;
    @IsNumber()
    public maxDuration: number;

    @IsArray()
    @Type(() => SequenceSync)
    public sequences?: SequenceSync[];

    public static mapToCycleModel(cycleSynchronizeDTO: CycleSynchronizeDTO): SynchronizeCycleModel {
        const cycle = new SynchronizeCycleModel();

        const splittedCycleId = cycleSynchronizeDTO.id.split('_');
        cycle.shouldDelete = splittedCycleId.length > 1 && splittedCycleId[0] === 'deleted';
        cycle.id = splittedCycleId[1] || splittedCycleId[0];
        if (cycle.shouldDelete) {
            return cycle;
        }

        cycle.name = cycleSynchronizeDTO.name;
        cycle.style = cycleSynchronizeDTO.style;
        cycle.description = cycleSynchronizeDTO.description;
        cycle.sequences = [];
        cycleSynchronizeDTO.sequences.forEach(sequenceSync => {
            const sequence = new SynchronizeSequenceModel();
            const splittedSequenceId = sequenceSync.sequence.id.split('_');
            sequence.shouldDelete = splittedSequenceId.length > 1 && splittedSequenceId[0] === 'deleted';
            sequence.id = splittedSequenceId[1] || splittedSequenceId[0];
            if (!sequence.shouldDelete) {
                sequence.name = sequenceSync.sequence.name;
                sequence.description = sequenceSync.sequence.description;
                sequence.duration = sequenceSync.sequence.duration;
                sequence.modules = [];
                sequenceSync.sequence.modules.forEach((moduleId) => {
                    const module = new SynchronizeModuleModel();
                    const splittedModuleId = moduleId.split('_');
                    module.shouldDelete = splittedModuleId.length > 1 && splittedModuleId[0] === 'deleted';
                    if (!module.shouldDelete) {
                        module.portNum = Number(splittedModuleId[1] || splittedModuleId[0]);
                    }
                    sequence.modules.push(module);
                })
            }
            cycle.sequences.push(sequence);
        });

        return cycle;
    }

}

