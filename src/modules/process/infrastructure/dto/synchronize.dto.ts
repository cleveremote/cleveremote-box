/* eslint-disable max-lines-per-function */

import { SynchronizeCycleModel, SynchronizeModuleModel, SynchronizeScheduleModel, SynchronizeSequenceModel } from '@process/domain/models/synchronize.model';
import { Type } from 'class-transformer';
import { IsArray, IsDate, IsNotEmpty, IsNumber, IsString } from 'class-validator';
export class SequenceSync {
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
        cycle.maxDuration = cycleSynchronizeDTO.maxDuration;
        cycle.sequences = [];
        cycleSynchronizeDTO.sequences.forEach(sequenceSync => {
            const sequence = new SynchronizeSequenceModel();
            const splittedSequenceId = sequenceSync.id.split('_');
            sequence.shouldDelete = splittedSequenceId.length > 1 && splittedSequenceId[0] === 'deleted';
            sequence.id = splittedSequenceId[1] || splittedSequenceId[0];
            if (!sequence.shouldDelete) {
                sequence.name = sequenceSync.name;
                sequence.description = sequenceSync.description;
                sequence.duration = sequenceSync.duration;
                sequence.modules = [];
                sequenceSync.modules.forEach((moduleId) => {
                    const module = new SynchronizeModuleModel();
                    const splittedModuleId = moduleId.split('_');
                    module.shouldDelete = splittedModuleId.length > 1 && splittedModuleId[0] === 'deleted';
                    module.portNum = Number(splittedModuleId[1] || splittedModuleId[0]);
                    sequence.modules.push(module);
                })
            }
            cycle.sequences.push(sequence);
        });

        return cycle;
    }

}

export class CronSync {
    @IsDate()
    public date: Date;
    @IsString()
    public pattern: string;
}
export class ScheduleSynchronizeDTO {
    @IsNotEmpty()
    public id: string;
    @IsString()
    public name?: string;
    @IsString()
    public description: string;
    @IsString()
    @IsNotEmpty()
    public cycleId: string;
    @Type(() => CronSync)
    public cron: CronSync;


    public static mapToScheduleModel(scheduleSynchronizeDTO: ScheduleSynchronizeDTO): SynchronizeScheduleModel {
        const scheduleModel = new SynchronizeScheduleModel();

        const splittedScheduleId = scheduleSynchronizeDTO.id.split('_');
        scheduleModel.shouldDelete = splittedScheduleId.length > 1 && splittedScheduleId[0] === 'deleted';
        scheduleModel.id = splittedScheduleId[1] || splittedScheduleId[0];
        scheduleModel.cycleId = scheduleSynchronizeDTO.cycleId;
        if (scheduleModel.shouldDelete) {
            return scheduleModel;
        }

        scheduleModel.name = scheduleSynchronizeDTO.name;
        scheduleModel.description = scheduleSynchronizeDTO.description;
        scheduleModel.cron = new CronSync();
        scheduleModel.cron.date = scheduleSynchronizeDTO.cron.date;
        scheduleModel.cron.pattern = scheduleSynchronizeDTO.cron.pattern;
        return scheduleModel;
    }
}
