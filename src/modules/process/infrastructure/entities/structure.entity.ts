/* eslint-disable max-lines-per-function */
import { ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { ConditionModel } from '@process/domain/models/condition.model';
import { CycleModel } from '@process/domain/models/cycle.model';
import { ModuleModel } from '@process/domain/models/module.model';
import { ScheduleModel } from '@process/domain/models/schedule.model';
import { SensorModel } from '@process/domain/models/sensor.model';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { StructureModel } from '@process/domain/models/structure.model';
import { TriggerModel } from '@process/domain/models/trigger.model';

export class StructureEntity {
    public configuration: string;

    public static mapToStructureModel(structureEntity: StructureEntity): StructureModel {
        const struct: StructureModel = new StructureModel();
        struct.cycles = [];
        struct.sensors = [];
        const data = JSON.parse(structureEntity.configuration) as StructureModel;


        data.sensors.forEach(sensorData => {
            const sensorModel = new SensorModel();
            sensorModel.id = sensorData.id;
            sensorModel.name = sensorData.name;
            sensorModel.description = sensorData.description;
            sensorModel.type = sensorData.type;
            sensorModel.unit = sensorData.unit;
            struct.sensors.push(sensorModel);
        });


        // mapping
        // eslint-disable-next-line max-lines-per-function
        data.cycles.forEach((cycleData) => {
            const cycle = new CycleModel();
            cycle.id = cycleData.id;
            cycle.status = ExecutableStatus.STOPPED;
            cycle.name = cycleData.name;
            cycle.description = cycleData.description;
            cycle.style = cycleData.style;
            cycle.modePriority = [];
            cycleData.modePriority.forEach((mode) => {
                cycle.modePriority.push(mode);
            })

            cycleData.sequences.forEach(sequenceData => {
                const sequence = new SequenceModel();
                sequence.id = sequenceData.id;
                sequence.name = sequenceData.name;
                sequence.status = sequenceData.status;
                sequence.maxDuration = sequenceData.maxDuration;
                sequence.modules = [];
                sequenceData.modules.forEach(moduleData => {
                    const module = new ModuleModel();
                    module.status = moduleData.status;
                    module.portNum = moduleData.portNum;
                    module.direction = moduleData.direction;
                    module.edge = moduleData.edge;
                    //mod1.debounceTimeout: number = undefined;
                    //mod1.activeLow: boolean = false;
                    //mod1.reconfigureDirection: boolean = true;
                    module.configure();
                    sequence.modules.push(module)
                });
                cycle.sequences.push(sequence);
            });

            cycleData.schedules.forEach(scheduleData => {
                const schedule = new ScheduleModel();
                schedule.id = scheduleData.id;
                schedule.cycleId = cycleData.id;
                schedule.name = scheduleData.name;
                schedule.description = scheduleData.description;
                schedule.cron = scheduleData.cron;
                if (scheduleData.cron.date) {
                    schedule.cron.date = new Date(scheduleData.cron.date);
                }
                schedule.isPaused = scheduleData.isPaused;
                cycle.schedules.push(schedule);
            });

            cycleData.triggers.forEach(triggerData => {
                const trigger = new TriggerModel();
                trigger.id = triggerData.id;
                trigger.cycleId = cycleData.id;
                trigger.name = triggerData.name;
                trigger.description = triggerData.description;
                trigger.trigger = { timeAfter: triggerData.trigger.timeAfter, sunBehavior: triggerData.trigger.sunBehavior }
                trigger.conditions = [];
                triggerData.conditions.forEach(conditionData => {
                    const conditionModel = new ConditionModel();
                    conditionModel.id = conditionData.id;
                    conditionModel.triggerId = conditionData.triggerId;
                    conditionModel.name = conditionData.name;
                    conditionModel.description = conditionData.description;
                    conditionModel.deviceId = conditionData.deviceId;
                    conditionModel.operator = conditionData.operator;
                    conditionModel.value = conditionData.value;
                    trigger.conditions.push(conditionModel)
                });
                trigger.conditions = triggerData.conditions;
                trigger.isPaused = triggerData.isPaused;
                cycle.triggers.push(trigger);
            });
            struct.cycles.push(cycle);
        });

        return struct;
    }

    public static mapToStructureEntity(structureModel: StructureModel): StructureEntity {
        const entity = new StructureEntity();
        entity.configuration = JSON.stringify(structureModel, (key, value) => {
            if (key === 'instance') return undefined;
            return value;
        });
        return entity;
    }

}

