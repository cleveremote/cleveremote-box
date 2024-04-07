/* eslint-disable max-lines-per-function */
/* eslint-disable max-lines */
import { ApiProperty } from '@nestjs/swagger';
import { ExecutableAction, ProcessMode } from '@process/domain/interfaces/executable.interface';
import { SunState } from '@process/domain/interfaces/schedule.interface';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { SynchronizeConditionModel, SynchronizeCycleModel, SynchronizeModuleModel, SynchronizeScheduleModel, SynchronizeSensorModel, SynchronizeSequenceModel, SynchronizeTriggerModel } from '@process/domain/models/synchronize.model';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDate, IsEnum, IsNotEmpty, IsNumber, IsString } from 'class-validator';
export class SequenceSync {
    @IsString()
    @IsNotEmpty()
    public id: string;
    @IsString()
    public name: string;
    @IsString()
    public description: string;
    @IsNumber()
    public maxDuration: number;
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

export class ModePriority {
    @IsEnum(ProcessMode)
    public mode: ProcessMode;
    @IsNumber()
    public priority: number;
}

export class CycleSynchronizeDTO {
    @IsString()
    public id: string;
    @IsString()
    public name?: string;
    @IsString()
    public description: string;
    @Type(() => Style)
    public style?: Style;
    @IsArray()
    @Type(() => ModePriority)
    public modePriority: ModePriority[];

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
        cycle.modePriority = [];
        if (cycleSynchronizeDTO.modePriority) {
            cycleSynchronizeDTO.modePriority?.forEach(priority => { //nya remove optional
                const priorityModel = { mode: priority.mode, priority: priority.priority };
                cycle.modePriority.push(priorityModel);
            });
        } else {
            cycle.modePriority.push({ mode: ProcessMode.MANUAL, priority: 0 });
            cycle.modePriority.push({ mode: ProcessMode.SCHEDULED, priority: 1 });
            cycle.modePriority.push({ mode: ProcessMode.TRIGGER, priority: 2 });
        }


        cycle.sequences = [];
        cycleSynchronizeDTO.sequences.forEach(sequenceSync => {
            const sequence = new SynchronizeSequenceModel();
            const splittedSequenceId = sequenceSync.id.split('_');
            sequence.shouldDelete = splittedSequenceId.length > 1 && splittedSequenceId[0] === 'deleted';
            sequence.id = splittedSequenceId[1] || splittedSequenceId[0];
            if (!sequence.shouldDelete) {
                sequence.name = sequenceSync.name;
                sequence.description = sequenceSync.description;
                sequence.maxDuration = sequenceSync.maxDuration;
                sequence.modules = [];
                sequenceSync.modules.forEach((moduleId) => {
                    const module = new SynchronizeModuleModel();
                    const splittedModuleId = moduleId.split('_');
                    module.shouldDelete = splittedModuleId.length > 1 && splittedModuleId[0] === 'deleted';
                    module.id = splittedModuleId[1] || splittedModuleId[0];
                    module.portNum = Number(splittedModuleId[1] || splittedModuleId[0]);
                    sequence.modules.push(module);
                })
            }
            cycle.sequences.push(sequence);
        });

        return cycle;
    }

}
export class SunBehavior {
    @IsEnum(SunState)
    @IsNotEmpty()
    @ApiProperty()
    public sunState: SunState;
    @IsBoolean()
    public isBefore: boolean;
    @IsNumber()
    public time: number;
}
export class CronSync {
    @IsDate()
    public date: Date;
    @IsString()
    public pattern: string;
    @Type(() => SunBehavior)
    public sunBehavior: SunBehavior;
    @IsNumber()
    public after: number;
}

export class triggerSync {
    @IsNumber()
    public timeAfter: number; //imemdiat if 0
    @Type(() => SunBehavior)
    public sunBehavior?: SunBehavior;
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
    @IsBoolean()
    public isPaused: boolean


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
        scheduleModel.cron.sunBehavior = new SunBehavior();
        scheduleModel.cron.sunBehavior.isBefore = scheduleSynchronizeDTO.cron.sunBehavior.isBefore;
        scheduleModel.cron.sunBehavior.sunState = scheduleSynchronizeDTO.cron.sunBehavior.sunState;
        scheduleModel.cron.sunBehavior.time = scheduleSynchronizeDTO.cron.sunBehavior.time;

        scheduleModel.isPaused = scheduleSynchronizeDTO.isPaused;
        return scheduleModel;
    }
}

export class ConditionSync {
    @IsString()
    @IsNotEmpty()
    public id: string;
    @IsString()
    public name: string;
    @IsString()
    public description: string;
    @IsString()
    public function: string;
    @IsString()
    public operator: string;
    @IsString()
    public deviceId: string;
}
export class TriggerSynchronizeDTO {
    @IsNotEmpty()
    public id: string;
    @IsString()
    public name?: string;
    @IsString()
    public description: string;
    @IsString()
    @IsNotEmpty()
    public cycleId: string;
    @IsEnum(ExecutableAction)
    @IsNotEmpty()
    @ApiProperty()
    public action: ExecutableAction;
    @Type(() => triggerSync)
    public trigger: triggerSync;
    @IsBoolean()
    public isPaused: boolean;
    @IsNumber()
    public delay: number;
    @IsBoolean()
    public shouldConfirmation: boolean;
    @IsArray()
    @Type(() => ConditionSync)
    public conditions?: ConditionSync[];

    public static mapToTriggerModel(triggerSynchronizeDTO: TriggerSynchronizeDTO): SynchronizeTriggerModel {
        const triggerModel = new SynchronizeTriggerModel();

        const splittedScheduleId = triggerSynchronizeDTO.id.split('_');
        triggerModel.shouldDelete = splittedScheduleId.length > 1 && splittedScheduleId[0] === 'deleted';
        triggerModel.id = splittedScheduleId[1] || splittedScheduleId[0];
        triggerModel.cycleId = triggerSynchronizeDTO.cycleId;
        if (triggerModel.shouldDelete) {
            return triggerModel;
        }

        triggerModel.name = triggerSynchronizeDTO.name;
        triggerModel.description = triggerSynchronizeDTO.description;
        triggerModel.trigger = new triggerSync();
        triggerModel.trigger.timeAfter = triggerSynchronizeDTO.trigger.timeAfter;
        triggerModel.shouldConfirmation = triggerSynchronizeDTO.shouldConfirmation;
        triggerModel.delay = triggerSynchronizeDTO.delay;
        triggerModel.action = triggerSynchronizeDTO.action;

        if (triggerSynchronizeDTO.trigger?.sunBehavior) {
            triggerModel.trigger.sunBehavior = new SunBehavior();
            triggerModel.trigger.sunBehavior.isBefore = triggerSynchronizeDTO.trigger?.sunBehavior?.isBefore;
            triggerModel.trigger.sunBehavior.sunState = triggerSynchronizeDTO.trigger.sunBehavior?.sunState;
            triggerModel.trigger.sunBehavior.time = triggerSynchronizeDTO.trigger?.sunBehavior?.time; //time befor or after sunset sunrise
        }

        if (triggerSynchronizeDTO.conditions?.length > 0) {
            triggerSynchronizeDTO.conditions.forEach(conditionSync => {
                const condition = new SynchronizeConditionModel();
                const splittedConditionId = conditionSync.id.split('_');
                condition.shouldDelete = splittedConditionId.length > 1 && splittedConditionId[0] === 'deleted';
                condition.id = splittedConditionId[1] || splittedConditionId[0];
                condition.triggerId = triggerModel.id;
                condition.name = conditionSync.name;
                condition.description = conditionSync.name;
                condition.deviceId = conditionSync.deviceId;
                condition.operator = conditionSync.operator;
                triggerModel.conditions.push(condition);
            });
        }
        triggerModel.isPaused = triggerSynchronizeDTO.isPaused;
        return triggerModel;
    }

}

export class SensorSynchronizeDTO {
    @IsNotEmpty()
    public id: string;
    @IsString()
    public name: string;
    @IsString()
    public unit: string;
    @IsString()
    public description: string;
    @IsNotEmpty()
    @ApiProperty()
    public type: SensorType;

    public static mapToSensorModel(sensorSynchronizeDTO: SensorSynchronizeDTO): SynchronizeSensorModel {
        const sensorModel = new SynchronizeSensorModel();

        const splittedScheduleId = sensorSynchronizeDTO.id.split('_');
        sensorModel.shouldDelete = splittedScheduleId.length > 1 && splittedScheduleId[0] === 'deleted';
        sensorModel.id = splittedScheduleId[1] || splittedScheduleId[0];
        if (sensorModel.shouldDelete) {
            return sensorModel;
        }

        sensorModel.name = sensorSynchronizeDTO.name;
        sensorModel.description = sensorSynchronizeDTO.description;
        sensorModel.id = sensorSynchronizeDTO.id;
        sensorModel.type = sensorSynchronizeDTO.type;
        sensorModel.unit = sensorSynchronizeDTO.unit;
        return sensorModel;
    }
}