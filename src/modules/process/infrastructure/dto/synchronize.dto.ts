/* eslint-disable max-lines-per-function */
/* eslint-disable max-lines */
import { ApiProperty } from '@nestjs/swagger';
import { ExecutableAction, ProcessMode } from '@process/domain/interfaces/executable.interface';
import { SunState } from '@process/domain/interfaces/schedule.interface';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { GPIODirection, GPIOEdge, ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { CycleModel } from '@process/domain/models/cycle.model';
import { ScheduleModel } from '@process/domain/models/schedule.model';
import { SensorModel } from '@process/domain/models/sensor.model';
import { StructureModel } from '@process/domain/models/structure.model';
import { SynchronizeConditionModel, SynchronizeModuleModel, SynchronizeScheduleModel, SynchronizeSequenceModel, SynchronizeTriggerModel } from '@process/domain/models/synchronize.model';
import { TriggerModel } from '@process/domain/models/trigger.model';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDate, IsDefined, IsEnum, IsNotEmpty, IsNumber, IsString, Validate, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
export class SequenceSync {
    @IsString()
    @IsNotEmpty()
    public id: string;
    @IsString()
    public name: string;
    @IsString()
    public description: string;
    @IsString()
    public mapSectionId: string;
    @IsNumber()
    public maxDuration: number;
    @IsNumber()
    public vfd: number;
    @IsArray()
    @Type(() => ModuleSync)
    public modules: ModuleSync[];
    @IsArray()
    @Type(() => ConditionSync)
    public conditions?: ConditionSync[];
}

export class Style {
    @IsString()
    public bgColor: string;
    @IsString()
    public fontColor: string;
    @IsString()
    public iconColor: any
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
    @IsString()
    public mapSectionId: string;
    @Type(() => Style)
    public style?: Style;
    @IsArray()
    @Type(() => ModePriority)
    public modePriority: ModePriority[];
    @IsArray()
    @Type(() => SequenceSync)
    public sequences?: SequenceSync[];
    @IsArray()
    @Type(() => TriggerSynchronizeDTO)
    public triggers?: TriggerSynchronizeDTO[];
    @IsArray()
    @Type(() => ScheduleSynchronizeDTO)
    public schedules?: ScheduleSynchronizeDTO[];

    public static mapToCycleModel(cycleSynchronizeDTO: CycleSynchronizeDTO): CycleModel {
        const cycle = new CycleModel();
        cycle.id = cycleSynchronizeDTO.id;
        cycle.name = cycleSynchronizeDTO.name;
        cycle.style = cycleSynchronizeDTO.style;
        cycle.description = cycleSynchronizeDTO.description;
        cycle.mapSectionId = cycleSynchronizeDTO.mapSectionId;

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
            //no need to save deleted...
            if (!sequence.shouldDelete) {
                sequence.name = sequenceSync.name;
                sequence.description = sequenceSync.description;
                sequence.mapSectionId = sequenceSync.mapSectionId;
                sequence.maxDuration = sequenceSync.maxDuration;
                sequence.vfd = sequenceSync.vfd;
                sequence.modules = [];
                sequenceSync.modules?.forEach((moduleDto) => {
                    const module = new SynchronizeModuleModel();
                    const splittedModuleId = moduleDto.id.split('_');
                    module.shouldDelete = splittedModuleId.length > 1 && splittedModuleId[0] === 'deleted';
                    //no need to save deleted...
                    if (!module.shouldDelete) {
                        module.id = splittedModuleId[1] || splittedModuleId[0];
                        module.portNum = Number(splittedModuleId[1] || splittedModuleId[0]);
                        module.status = ModuleStatus.OFF;
                        module.direction = GPIODirection.OUT;
                        module.edge = GPIOEdge.BOTH;
                        delete module.instance;
                        sequence.modules.push(module);
                    }
                });
                sequence.conditions = [];
                if (sequenceSync.conditions?.length > 0) {
                    sequenceSync.conditions.forEach(conditionSync => {
                        const condition = new SynchronizeConditionModel();
                        const splittedConditionId = conditionSync.id.split('_');
                        condition.shouldDelete = splittedConditionId.length > 1 && splittedConditionId[0] === 'deleted';
                        if (!condition.shouldDelete) {
                            condition.id = splittedConditionId[1] || splittedConditionId[0];
                            condition.parentId = sequenceSync.id;
                            condition.name = conditionSync.name;
                            condition.description = conditionSync.name;
                            condition.deviceId = conditionSync.deviceId;
                            condition.operator = conditionSync.operator;
                            condition.value = conditionSync.value;
                            sequence.conditions.push(condition);
                        }
                    });
                }
                cycle.sequences.push(sequence);
            }

        });

        cycle.triggers = [];
        cycleSynchronizeDTO.triggers?.forEach(triggerSync => {
            const trigger = new SynchronizeTriggerModel();
            const splittedTriggerId = triggerSync.id.split('_');
            trigger.shouldDelete = splittedTriggerId.length > 1 && splittedTriggerId[0] === 'deleted';
            trigger.id = splittedTriggerId[1] || splittedTriggerId[0];
            //no need to save deleted...
            if (!trigger.shouldDelete) {
                trigger.name = triggerSync.name;
                trigger.description = triggerSync.description;
                trigger.shouldConfirmation = triggerSync.shouldConfirmation;
                trigger.isPaused = triggerSync.isPaused;
                trigger.trigger = triggerSync.trigger;
                trigger.cycleId = triggerSync.cycleId;
                trigger.delay = triggerSync.delay;
                trigger.action = triggerSync.action;

                trigger.conditions = [];
                if (triggerSync.conditions?.length > 0) {
                    triggerSync.conditions.forEach(conditionSync => {
                        const condition = new SynchronizeConditionModel();
                        const splittedConditionId = conditionSync.id.split('_');
                        condition.shouldDelete = splittedConditionId.length > 1 && splittedConditionId[0] === 'deleted';
                        if (!condition.shouldDelete) {
                            condition.id = splittedConditionId[1] || splittedConditionId[0];
                            condition.parentId = triggerSync.id;
                            condition.name = conditionSync.name;
                            condition.description = conditionSync.description;
                            condition.deviceId = conditionSync.deviceId;
                            condition.operator = conditionSync.operator;
                            condition.value = conditionSync.value;
                            trigger.conditions.push(condition);
                        }
                    });
                }
                cycle.triggers.push(trigger);
            }
        });

        cycle.schedules = [];
        cycleSynchronizeDTO.schedules?.forEach(scheduleSync => {
            const scheduleModel = new SynchronizeScheduleModel();
            const splittedTriggerId = scheduleSync.id.split('_');
            scheduleModel.shouldDelete = splittedTriggerId.length > 1 && splittedTriggerId[0] === 'deleted';
            scheduleModel.id = splittedTriggerId[1] || splittedTriggerId[0];
            if (!scheduleModel.shouldDelete) {
                scheduleModel.id = scheduleSync.id;
                scheduleModel.cycleId = scheduleSync.cycleId;
                scheduleModel.name = scheduleSync.name;
                scheduleModel.description = scheduleSync.description;
                scheduleModel.cron = new CronSync();
                scheduleModel.cron.date = scheduleSync.cron?.date;
                scheduleModel.cron.pattern = scheduleSync.cron?.pattern;
                scheduleModel.cron.after = scheduleSync.cron?.after;
                if (scheduleSync.cron?.sunBehavior) {
                    scheduleModel.cron.sunBehavior = new SunBehavior();
                    scheduleModel.cron.sunBehavior.sunState = scheduleSync.cron?.sunBehavior?.sunState;
                    scheduleModel.cron.sunBehavior.time = scheduleSync.cron?.sunBehavior?.time;
                }
                scheduleModel.isPaused = scheduleSync.isPaused;
                scheduleModel.shouldConfirmation = scheduleSync.shouldConfirmation;
                cycle.schedules.push(scheduleModel);
            }
        })
        return cycle;
    }

}
export class SunBehavior {
    @IsEnum(SunState)
    @IsNotEmpty()
    @ApiProperty()
    public sunState: SunState;
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

export class TriggerSync {
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
    @IsBoolean()
    public shouldConfirmation: boolean


    public static mapToScheduleModel(scheduleSynchronizeDTO: ScheduleSynchronizeDTO): ScheduleModel {
        const scheduleModel = new ScheduleModel();
        scheduleModel.id = scheduleSynchronizeDTO.id;
        scheduleModel.cycleId = scheduleSynchronizeDTO.cycleId;
        scheduleModel.name = scheduleSynchronizeDTO.name;
        scheduleModel.description = scheduleSynchronizeDTO.description;
        scheduleModel.cron = new CronSync();
        scheduleModel.cron.date = scheduleSynchronizeDTO.cron.date;
        scheduleModel.cron.after = scheduleSynchronizeDTO.cron.after;
        scheduleModel.cron.pattern = scheduleSynchronizeDTO.cron.pattern;
        if (scheduleSynchronizeDTO.cron.sunBehavior) {
            scheduleModel.cron.sunBehavior = new SunBehavior();
            scheduleModel.cron.sunBehavior.sunState = scheduleSynchronizeDTO.cron.sunBehavior.sunState;
            scheduleModel.cron.sunBehavior.time = scheduleSynchronizeDTO.cron.sunBehavior.time;
        }

        scheduleModel.isPaused = scheduleSynchronizeDTO.isPaused;
        scheduleModel.shouldConfirmation = scheduleSynchronizeDTO.shouldConfirmation;
        return scheduleModel;
    }
}
@ValidatorConstraint({ name: 'string-or-number', async: false })
export class IsNumberOrString implements ValidatorConstraintInterface {
    public validate(text: any, args: ValidationArguments) {
        return typeof text === 'number' || typeof text === 'string';
    }

    public defaultMessage(args: ValidationArguments) {
        return '($value) must be number or string';
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
    @IsDefined()
    @Validate(IsNumberOrString)
    public value: number | ExecutableAction;
    @IsString()
    public operator: string;
    @IsString()
    public deviceId: string;
}

export class ModuleSync {
    @IsString()
    @IsNotEmpty()
    public id: string;
    @IsString()
    public portNum: string;
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
    @Type(() => TriggerSync)
    public trigger: TriggerSync;
    @IsBoolean()
    public isPaused: boolean;
    @IsNumber()
    public delay: number;
    @IsBoolean()
    public shouldConfirmation: boolean;
    @IsArray()
    @Type(() => ConditionSync)
    public conditions?: ConditionSync[];

    public static mapToTriggerModel(triggerSynchronizeDTO: TriggerSynchronizeDTO): TriggerModel {
        const triggerModel = new TriggerModel();

        triggerModel.id = triggerSynchronizeDTO.id;
        triggerModel.name = triggerSynchronizeDTO.name;
        triggerModel.description = triggerSynchronizeDTO.description;
        triggerModel.trigger = new TriggerSync();
        triggerModel.trigger.timeAfter = triggerSynchronizeDTO.trigger.timeAfter;
        triggerModel.shouldConfirmation = triggerSynchronizeDTO.shouldConfirmation;
        triggerModel.delay = triggerSynchronizeDTO.delay;
        triggerModel.action = triggerSynchronizeDTO.action;
        triggerModel.cycleId = triggerSynchronizeDTO.cycleId;

        if (triggerSynchronizeDTO.trigger?.sunBehavior) {
            triggerModel.trigger.sunBehavior = new SunBehavior();
            triggerModel.trigger.sunBehavior.sunState = triggerSynchronizeDTO.trigger.sunBehavior?.sunState;
            triggerModel.trigger.sunBehavior.time = triggerSynchronizeDTO.trigger?.sunBehavior?.time; //time befor or after sunset sunrise
        }
        triggerModel.conditions = [];
        if (triggerSynchronizeDTO.conditions?.length > 0) {
            triggerSynchronizeDTO.conditions.forEach(conditionSync => {
                const condition = new SynchronizeConditionModel();
                const splittedConditionId = conditionSync.id.split('_');
                condition.shouldDelete = splittedConditionId.length > 1 && splittedConditionId[0] === 'deleted';
                condition.id = splittedConditionId[1] || splittedConditionId[0];
                condition.parentId = triggerModel.id;
                condition.name = conditionSync.name;
                condition.description = conditionSync.name;
                condition.deviceId = conditionSync.deviceId;
                condition.operator = conditionSync.operator;
                condition.value = conditionSync.value;
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
    @Type(() => Style)
    public style?: Style;
    @IsNotEmpty()
    @ApiProperty()
    public type: SensorType;

    public static mapToSensorModel(sensorSynchronizeDTO: SensorSynchronizeDTO): SensorModel {
        const sensorModel = new SensorModel();
        sensorModel.id = sensorSynchronizeDTO.id;
        sensorModel.name = sensorSynchronizeDTO.name;
        sensorModel.description = sensorSynchronizeDTO.description;
        sensorModel.style = sensorSynchronizeDTO.style;
        sensorModel.id = sensorSynchronizeDTO.id;
        sensorModel.type = sensorSynchronizeDTO.type;
        sensorModel.unit = sensorSynchronizeDTO.unit;
        return sensorModel;
    }
}

export class StructureSynchronizeDTO {

    @IsArray()
    @Type(() => CycleSynchronizeDTO)
    public cycles: CycleSynchronizeDTO[];
    @IsArray()
    @Type(() => SensorSynchronizeDTO)
    public sensors: SensorSynchronizeDTO[];

    public static mapToStructureModel(structureSynchronizeDTO: StructureSynchronizeDTO): StructureModel {

        const structureModel = new StructureModel();
        structureModel.cycles = [];
        structureModel.sensors = [];

        structureSynchronizeDTO.cycles.forEach(cycle => {
            structureModel.cycles.push(CycleSynchronizeDTO.mapToCycleModel(cycle));
        });

        structureSynchronizeDTO.sensors.forEach(cycle => {
            structureModel.sensors.push(SensorSynchronizeDTO.mapToSensorModel(cycle));
        });

        return structureModel;
    }
}