/* eslint-disable max-lines-per-function */
/* eslint-disable max-lines */
import { ApiProperty } from '@nestjs/swagger';
import { ConditionsLogic, CycleType, ExecutableAction, ExecutionMode, ProcessMode } from '@process/domain/interfaces/executable.interface';
import { ChildCycleRef } from '@process/domain/models/cycle.model';
import { SunState } from '@process/domain/interfaces/schedule.interface';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { GPIODirection, GPIOEdge, ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { ComSensorConfigModel, ForcastSensorConfigModel, forcastDataName } from '@process/domain/models/sensor.model';
import { StructureModel } from '@process/domain/models/structure.model';
import { ComActuatorConfigModel, RpiActuatorConfigModel, CtrlActuatorConfigModel } from '@process/domain/models/actuator.model';
import { DeviceType, DeviceKind, MasterConfigModel, MasterProtocol, SlaveConfigModel } from '@process/domain/models/device.model';
import { ModbusFunctionName } from '@process/domain/models/com-request.model';
import { ComRequestType } from '@process/domain/interfaces/com-request.interface';
import {
    SynchronizeConditionModel,
    SynchronizeCycleModel,
    SynchronizeDeviceModel,
    SynchronizeComRequestModel,
    SynchronizeActuatorModel,
    SynchronizeScheduleModel,
    SynchronizeSensorModel,
    SynchronizeSequenceModel,
    SynchronizeTriggerModel
} from '@process/domain/models/synchronize.model';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsBoolean, IsDate, IsDefined, isEmpty, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Validate, ValidateIf, ValidateNested, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { isValidUuid } from '@process/domain/utils/id.util';
import { ElementType } from '@process/domain/models/event.model';

export class PersistenceDTO {
    @IsBoolean()
    @ApiProperty({ description: "Si vrai, écriture persistante (EEPROM) plutôt que volatile" })
    public persist: boolean;

    @IsNumber()
    @ApiProperty({ description: "Adresse cible pour l'écriture persistante" })
    public address: number;
}

@ValidatorConstraint({ name: 'number-or-number-array', async: false })
export class IsNumberOrNumberArray implements ValidatorConstraintInterface {
    public validate(value: any, args: ValidationArguments) {
        return typeof value === 'number' || (Array.isArray(value) && value.every(item => typeof item === 'number'));
    }

    public defaultMessage(args: ValidationArguments) {
        return '($value) must be a number or an array of numbers';
    }
}

export class ModbusTaskParams {
    @IsNotEmpty()
    @IsNumber()
    @ApiProperty({ description: "Longueur (nombre de registres à lire ou écrire)" })
    public length: number;

    @IsNotEmpty()
    @IsNumber()
    @ApiProperty({ description: "Facteur d’échelle appliqué à la valeur brute" })
    public scale: number;

    @IsNotEmpty()
    @IsString()
    @ApiProperty({ description: "Unité de mesure (ex: °C, L/h, bar...)" })
    public unit: string;

    @IsOptional()
    @Validate(IsNumberOrNumberArray)
    @ApiProperty({ description: "Valeur à écrire (registre/coil unique) ou tableau de valeurs (écriture multiple)", required: false })
    public value?: number | number[];

    @IsOptional()
    @ValidateNested()
    @Type(() => PersistenceDTO)
    @ApiProperty({ description: "Configuration de persistance (EEPROM) du paramètre, si applicable" })
    public persistence?: PersistenceDTO;
}

export class ComRequestConfigDTO {
    @IsArray()
    @ArrayNotEmpty()
    @IsEnum(ModbusFunctionName, { each: true })
    @ApiProperty({ description: "Fonction(s) Modbus à exécuter", enum: ModbusFunctionName, isArray: true })
    public function: ModbusFunctionName[];

    @IsNotEmpty()
    @IsNumber()
    @ApiProperty({ description: "Adresse Modbus à interroger (ou écrire)" })
    public address: number;

    @IsOptional()
    @IsBoolean()
    @ApiProperty({ description: "Désactive la requête sans la supprimer", required: false })
    public disabled?: boolean;

    @IsOptional()
    @IsBoolean()
    @ApiProperty({ description: "Indique si la requête a été traitée", required: false, default: false })
    public done?: boolean;

    @ValidateNested()
    @Type(() => ModbusTaskParams)
    @ApiProperty({ description: "Paramètres de la requête (longueur, échelle, unité)" })
    public params?: ModbusTaskParams;
}

export class CustomStackSync {
    @IsString()
    @IsNotEmpty()
    public comRequestId: string;
    @IsOptional()
    @ValidateNested()
    @Type(() => ComRequestConfigDTO)
    public params?: ComRequestConfigDTO;
    @IsOptional()
    @ValidateNested()
    @Type(() => ComRequestConfigDTO)
    public defaultParams?: ComRequestConfigDTO;
}

export class SecurityConfigSync {
    @IsNumber()
    public maxDuration: number = 60000;
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ConditionSync)
    public conditions?: ConditionSync[];
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CustomStackSync)
    public customStacks?: CustomStackSync[];
}

export class SequenceSync {
    @IsOptional()
    @IsString()
    public _id: string;
    @IsString()
    public name: string;
    @IsString()
    public description: string;
    @IsNumber()
    public order: number = 0;
    @ValidateNested()
    @Type(() => SecurityConfigSync)
    public securityConfig: SecurityConfigSync = { maxDuration: 60000 };
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => moduleConfigsSync)
    public moduleConfigs: moduleConfigsSync[];
    @IsOptional()
    @IsBoolean()
    public delete?: boolean = false;
}

export class ChildCycleConfigSync {
    @IsNumber()
    public order: number;
    @IsBoolean()
    public waitForCompletion: boolean;
    @IsNumber()
    public delayBefore: number;
    @IsNumber()
    public delayAfter: number;
    @IsBoolean()
    public isSkipped: boolean;
}

export class ChildCycleSync {
    @IsString()
    @IsNotEmpty()
    public cycleId: string;
    @ValidateNested()
    @Type(() => ChildCycleConfigSync)
    public config: ChildCycleConfigSync;
}

export class IconColorSync {
    @IsString()
    public icon: string;
    @IsString()
    public base: string;
}

export class Style {
    @IsString()
    public bgColor: string;
    @IsString()
    public fontColor: string;
    @ValidateNested()
    @Type(() => IconColorSync)
    public iconColor: IconColorSync;
}

export class ModePriority {
    @IsEnum(ProcessMode)
    public mode: ProcessMode;
    @IsNumber()
    public priority: number;
}

export class CycleSynchronizeDTO {
    @IsOptional()
    @IsString()
    public _id: string;
    // gestion des groupes / sous-cycles (GROUP)
    @IsOptional()
    @IsEnum(CycleType)
    public type?: CycleType = CycleType.CYCLE;
    @IsString()
    public name: string;
    @IsOptional()
    @IsString()
    public description: string;
    @IsOptional()
    @ValidateNested()
    @Type(() => Style)
    public style?: Style = {
        "bgColor": "#2196F3",
        "fontColor": "#FFFFFF",
        "iconColor": {
            "icon": "water-drop",
            "base": "#1565C0"
        }
    };
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ModePriority)
    public modePriority?: ModePriority[] = [
        { mode: ProcessMode.MANUAL, priority: 0 },
        { mode: ProcessMode.SCHEDULED, priority: 1 },
        { mode: ProcessMode.TRIGGER, priority: 2 }
    ];
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SequenceSync)
    public sequences?: SequenceSync[];
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => TriggerSynchronizeDTO)
    public triggers?: TriggerSynchronizeDTO[];
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ScheduleSynchronizeDTO)
    public schedules?: ScheduleSynchronizeDTO[];

    @IsOptional()
    @IsEnum(ExecutionMode)
    public executionMode?: ExecutionMode = ExecutionMode.SEQUENTIAL;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ConditionSync)
    public conditions?: ConditionSync[];
    @IsOptional()
    @IsEnum(ConditionsLogic)
    public conditionsLogic?: ConditionsLogic = ConditionsLogic.AND;
    @IsOptional()
    @IsString()
    public parentCycleId: string = null;
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ChildCycleSync)
    public childCycles?: ChildCycleSync[];
    @IsOptional()
    @IsBoolean()
    public delete?: boolean = false;

    public static mapToCycleModel(cycleSynchronizeDTO: CycleSynchronizeDTO): SynchronizeCycleModel {
        const cycle = new SynchronizeCycleModel();
        cycle._id = cycleSynchronizeDTO._id;
        cycle.name = cycleSynchronizeDTO.name;
        cycle.delete = cycleSynchronizeDTO.delete ?? false;
        cycle.style = cycleSynchronizeDTO.style;
        cycle.description = cycleSynchronizeDTO.description;

        cycle.type = cycleSynchronizeDTO.type ?? CycleType.CYCLE;
        cycle.executionMode = cycleSynchronizeDTO.executionMode ?? ExecutionMode.SEQUENTIAL;
        cycle.conditionsLogic = cycleSynchronizeDTO.conditionsLogic ?? ConditionsLogic.AND;
        cycle.parentCycleId = cycleSynchronizeDTO.parentCycleId ?? null;
        cycle.conditions = (cycleSynchronizeDTO.conditions ?? []).map(conditionSync => {
            const condition = new SynchronizeConditionModel();
            condition.name = conditionSync.name;
            condition.elementId = conditionSync.elementId;
            condition.elementType = conditionSync.elementType;
            condition.operator = conditionSync.operator;
            condition.value = conditionSync.value;
            return condition;
        });
        cycle.childCycles = (cycleSynchronizeDTO.childCycles ?? []).map((childCycleSync): ChildCycleRef => ({
            cycleId: childCycleSync.cycleId,
            config: {
                order: childCycleSync.config.order,
                waitForCompletion: childCycleSync.config.waitForCompletion,
                delayBefore: childCycleSync.config.delayBefore,
                delayAfter: childCycleSync.config.delayAfter,
                isSkipped: childCycleSync.config.isSkipped
            }
        }));

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

        cycle.sequences = (cycleSynchronizeDTO.sequences ?? []).map(sequenceSync => {
            const sequence = new SynchronizeSequenceModel();
            sequence._id = sequenceSync._id;
            sequence.name = sequenceSync.name;
            sequence.description = sequenceSync.description;
            sequence.order = sequenceSync.order;
            sequence.securityConfig = {
                maxDuration: sequenceSync.securityConfig.maxDuration,
                ...(sequenceSync.securityConfig.customStacks !== undefined && {
                    customStacks: sequenceSync.securityConfig.customStacks.map(customStackSync => ({
                        comRequestId: customStackSync.comRequestId,
                        ...(customStackSync.params !== undefined && {
                            params: {
                                function: customStackSync.params.function,
                                address: customStackSync.params.address,
                                disabled: customStackSync.params.disabled,
                                done: customStackSync.params.done ?? false,
                                params: customStackSync.params.params || undefined
                            }
                        }),
                        ...(customStackSync.defaultParams !== undefined && {
                            defaultParams: {
                                function: customStackSync.defaultParams.function,
                                address: customStackSync.defaultParams.address,
                                disabled: customStackSync.defaultParams.disabled,
                                done: customStackSync.defaultParams.done ?? false,
                                params: customStackSync.defaultParams.params || undefined
                            }
                        })
                    }))
                }),
                ...(sequenceSync.securityConfig.conditions !== undefined && {
                    conditions: sequenceSync.securityConfig.conditions.map(conditionSync => {
                        const condition = new SynchronizeConditionModel();
                        condition.name = conditionSync.name;
                        condition.elementId = conditionSync.elementId;
                        condition.elementType = conditionSync.elementType;
                        condition.operator = conditionSync.operator;
                        condition.value = conditionSync.value;
                        return condition;
                    })
                })
            };
            // les modules (actuator-rpi/actuator-com) sont geres via leurs endpoints de sync dedies ;
            // ici on ne fait que reference leur id, avec un timing par defaut a 0.
            sequence.moduleConfigs = (sequenceSync.moduleConfigs ?? []).map((moduleDto) => ({
                moduleId: moduleDto.moduleId,
                configTiming: moduleDto.configTiming || { waitBeforeExec: 0, waitAfterExec: 0, waitBeforeExecOff: 0, waitAfterExecOff: 0 },
                ...(moduleDto.customValue !== undefined && { customValue: moduleDto.customValue })
            }));
            sequence.delete = sequenceSync.delete ?? false;
            return sequence;
        });

        cycle.triggers = (cycleSynchronizeDTO.triggers ?? []).map(triggerSync => {
            const trigger = new SynchronizeTriggerModel();
            trigger.id = triggerSync._id;
            trigger.name = triggerSync.name;
            trigger.description = triggerSync.description;
            trigger.shouldConfirmation = triggerSync.shouldConfirmation;
            trigger.isPaused = triggerSync.isPaused;
            trigger.trigger = triggerSync.trigger;
            trigger.cycleId = triggerSync.cycleId;
            trigger.delay = triggerSync.delay;
            trigger.action = triggerSync.action;
            trigger.duration = triggerSync.duration;
            trigger.conditions = (triggerSync.conditions ?? []).map(conditionSync => {
                const condition = new SynchronizeConditionModel();
                condition.name = conditionSync.name;
                condition.elementId = conditionSync.elementId;
                condition.elementType = conditionSync.elementType;
                condition.operator = conditionSync.operator;
                condition.value = conditionSync.value;
                return condition;
            });
            trigger.delete = triggerSync.delete ?? false;
            return trigger;
        });

        cycle.schedules = (cycleSynchronizeDTO.schedules ?? []).map(scheduleSync => {
            const scheduleModel = new SynchronizeScheduleModel();
            scheduleModel._id = scheduleSync._id;
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
            scheduleModel.duration = scheduleSync.duration;
            scheduleModel.delete = scheduleSync.delete ?? false;
            return scheduleModel;
        });
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
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    public date?: Date;
    @IsOptional()
    @IsString()
    public pattern?: string;
    @IsOptional()
    @ValidateNested()
    @Type(() => SunBehavior)
    public sunBehavior?: SunBehavior;
    @IsOptional()
    @IsNumber()
    public after?: number;
}

export class TriggerSync {
    @IsNumber()
    public timeAfter: number; //imemdiat if 0
    @IsOptional()
    @ValidateNested()
    @Type(() => SunBehavior)
    public sunBehavior?: SunBehavior;
}

export class ScheduleSynchronizeDTO {
    @IsOptional()
    @IsString()
    public _id: string;
    @IsString()
    public name?: string;
    @IsString()
    public description: string;
    @IsString()
    public cycleId?: string;
    @ValidateNested()
    @Type(() => CronSync)
    public cron: CronSync;
    @IsBoolean()
    public isPaused: boolean
    @IsBoolean()
    public shouldConfirmation: boolean
    @IsOptional()
    @IsNumber()
    public duration?: number;
    @IsOptional()
    @IsBoolean()
    public delete?: boolean = false;


    public static mapToScheduleModel(scheduleSynchronizeDTO: ScheduleSynchronizeDTO): SynchronizeScheduleModel {
        const scheduleModel = new SynchronizeScheduleModel();
        scheduleModel._id = scheduleSynchronizeDTO._id;
        scheduleModel.delete = scheduleSynchronizeDTO.delete ?? false;
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
        scheduleModel.duration = scheduleSynchronizeDTO.duration;
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
    public name: string;
    @IsDefined()
    @Validate(IsNumberOrString)
    public value: number | ExecutableAction;
    @IsString()
    public operator: string;
    @IsString()
    public elementId: string;
    @IsEnum(ElementType)
    public elementType: ElementType;
}

export class ModuleTimingConfigSync {
    waitBeforeExec: number;
    waitAfterExec: number;
    waitBeforeExecOff: number;
    waitAfterExecOff: number;
}

export class moduleConfigsSync {
    @IsString()
    @IsNotEmpty()
    public moduleId: string;

    @Type(() => ModuleTimingConfigSync)
    public configTiming: ModuleTimingConfigSync;

    @IsOptional()
    @IsNumber()
    public customValue?: number;
}

export class TriggerSynchronizeDTO {
    @IsOptional()
    @IsString()
    public _id: string;
    @IsString()
    public name?: string;
    @IsString()
    public description: string;
    @IsString()
    public cycleId?: string;
    @IsEnum(ExecutableAction)
    @IsNotEmpty()
    @ApiProperty()
    public action: ExecutableAction;
    @ValidateNested()
    @Type(() => TriggerSync)
    public trigger: TriggerSync;
    @IsBoolean()
    public isPaused: boolean;
    @IsNumber()
    public delay: number;
    @IsBoolean()
    public shouldConfirmation: boolean;
    @IsOptional()
    @IsNumber()
    public duration?: number;
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ConditionSync)
    public conditions?: ConditionSync[];
    @IsOptional()
    @IsBoolean()
    public delete?: boolean = false;

    public static mapToTriggerModel(triggerSynchronizeDTO: TriggerSynchronizeDTO): SynchronizeTriggerModel {
        const triggerModel = new SynchronizeTriggerModel();
        triggerModel.id = triggerSynchronizeDTO._id;
        triggerModel.delete = triggerSynchronizeDTO.delete ?? false;
        triggerModel.name = triggerSynchronizeDTO.name;
        triggerModel.description = triggerSynchronizeDTO.description;
        triggerModel.trigger = new TriggerSync();
        triggerModel.trigger.timeAfter = triggerSynchronizeDTO.trigger.timeAfter;
        triggerModel.shouldConfirmation = triggerSynchronizeDTO.shouldConfirmation;
        triggerModel.delay = triggerSynchronizeDTO.delay;
        triggerModel.action = triggerSynchronizeDTO.action;
        triggerModel.cycleId = triggerSynchronizeDTO.cycleId;
        triggerModel.duration = triggerSynchronizeDTO.duration;

        if (triggerSynchronizeDTO.trigger?.sunBehavior) {
            triggerModel.trigger.sunBehavior = new SunBehavior();
            triggerModel.trigger.sunBehavior.sunState = triggerSynchronizeDTO.trigger.sunBehavior?.sunState;
            triggerModel.trigger.sunBehavior.time = triggerSynchronizeDTO.trigger?.sunBehavior?.time; //time befor or after sunset sunrise
        }
        triggerModel.conditions = (triggerSynchronizeDTO.conditions ?? []).map(conditionSync => {
            const condition = new SynchronizeConditionModel();
            condition.name = conditionSync.name;
            condition.elementId = conditionSync.elementId;
            condition.elementType = conditionSync.elementType;
            condition.operator = conditionSync.operator;
            condition.value = conditionSync.value;
            return condition;
        });
        triggerModel.isPaused = triggerSynchronizeDTO.isPaused;
        return triggerModel;
    }

}

export class SensorConfigDTO {
    // requis pour FORCAST/COM ; absent quand le sensor est un enfant (parentId renseigne)
    @ValidateIf(o => !o.code)
    @IsString()
    @IsNotEmpty()
    public cronPattern?: string;

    // FORCAST
    @ValidateIf(o => o.type === SensorType.FORCAST)
    @IsEnum(forcastDataName)
    public forcastData?: forcastDataName;

    // COM
    @ValidateIf(o => o.type === SensorType.COM)
    @IsString()
    @IsNotEmpty()
    public comRequestId?: string;

    // CHILD COM (sensor avec parentId)
    @IsOptional()
    @IsNumber()
    public code?: number;
    @IsOptional()
    @IsNumber()
    public scale?: number;
    @IsOptional()
    @IsString()
    public unit?: string;
}

export class SensorSynchronizeDTO {
    @IsOptional()
    @IsNotEmpty()
    public id: string;
    @IsString()
    public name: string;
    @IsString()
    public description: string;
    @ValidateNested()
    @Type(() => Style)
    public style?: Style;
    @IsEnum(SensorType)
    @IsNotEmpty()
    @ApiProperty()
    public type: SensorType;
    // relation auto-referencee : identifiant du sensor parent (device MASTER_COM)
    @IsOptional()
    @IsString()
    public parentId?: string = null;
    @ValidateNested()
    @Type(() => SensorConfigDTO)
    public config: SensorConfigDTO;
    @IsOptional()
    @IsBoolean()
    public delete?: boolean = false;

    public static mapToSensorModel(sensorSynchronizeDTO: SensorSynchronizeDTO): SynchronizeSensorModel {
        const sensorModel = new SynchronizeSensorModel();
        sensorModel.id = sensorSynchronizeDTO.id;
        sensorModel.name = sensorSynchronizeDTO.name;
        sensorModel.description = sensorSynchronizeDTO.description;
        sensorModel.style = sensorSynchronizeDTO.style;
        sensorModel.type = sensorSynchronizeDTO.type;
        sensorModel.parentId = sensorSynchronizeDTO.parentId ?? null;
        sensorModel.config = sensorSynchronizeDTO.type === SensorType.FORCAST
            ? Object.assign(new ForcastSensorConfigModel(), sensorSynchronizeDTO.config)
            : Object.assign(new ComSensorConfigModel(), sensorSynchronizeDTO.config);
        sensorModel.delete = sensorSynchronizeDTO.delete ?? false;
        return sensorModel;
    }
}


export class ValveConfigDTO {
    @IsString()
    public deviceId: string;
    @IsNumber()
    public channel: number;
    @IsString()
    public flowMeterId: string;
    @IsNumber()
    public maxFlowRate?: number;
    @IsNumber()
    public kP?: number;
    @IsNumber()
    public minOpening?: number;
    @IsNumber()
    public maxOpening?: number;
    @IsNumber()
    public tolerance?: number;
    @IsNumber()
    public maxIterations?: number;
    @IsNumber()
    public iterationDelayMs?: number;
    @IsOptional()
    @IsNumber()
    public fullStrokeMs?: number;
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ComActuatorActionConfigDTO)
    public actions?: ComActuatorActionConfigDTO[];
}

export class ValveSynchronizeDTO {
    @IsOptional()
    @IsNotEmpty()
    public id: string;
    @IsString()
    public name: string;
    @IsString()
    public description: string;
    @IsString()
    public type?: string;
    @ValidateNested()
    @Type(() => ValveConfigDTO)
    public config: ValveConfigDTO;
    @IsOptional()
    @IsBoolean()
    public delete?: boolean = false;

    public static mapToValveModel(valveSynchronizeDTO: ValveSynchronizeDTO): SynchronizeActuatorModel {
        const valveModel = new SynchronizeActuatorModel();
        valveModel._id = valveSynchronizeDTO.id;
        valveModel.name = valveSynchronizeDTO.name;
        valveModel.description = valveSynchronizeDTO.description;
        valveModel.type = ActuatorType.CTRL;
        valveModel.status = ModuleStatus.OFF;
        const config = Object.assign(new CtrlActuatorConfigModel(), valveSynchronizeDTO.config);
        config.valveType = valveSynchronizeDTO.type ?? 'PROPORTIONAL';
        valveModel.config = config;
        valveModel.delete = valveSynchronizeDTO.delete ?? false;
        return valveModel;
    }
}

export class ComActuatorActionConfigDTO {
    @IsString()
    @IsNotEmpty()
    public comRequestId: string;

    @IsNumber()
    public digitalPort: number;
}

export class ActuatorConfigDTO {
    // RPI
    @ValidateIf(o => o.type === ActuatorType.RPI)
    @IsNumber()
    public rpiPin?: number;
    @ValidateIf(o => o.type === ActuatorType.RPI)
    @IsEnum(GPIODirection)
    public direction?: GPIODirection;
    @ValidateIf(o => o.type === ActuatorType.RPI)
    @IsEnum(GPIOEdge)
    public edge?: GPIOEdge;
    @IsOptional()
    @IsBoolean()
    public activeLow?: boolean;
    @IsOptional()
    @IsBoolean()
    public reconfigureDirection?: boolean;
    @IsOptional()
    @IsNumber()
    public debounceTimeout?: number;

    // COM
    @ValidateIf(o => o.type === ActuatorType.COM)
    @IsString()
    @IsNotEmpty()
    public deviceId?: string;

    @ValidateIf(o => o.type === ActuatorType.COM)
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ComActuatorActionConfigDTO)
    public actions?: ComActuatorActionConfigDTO[];
}

export class ActuatorSynchronizeDTO {
    public _id: string;
    @IsEnum(ActuatorType)
    @IsNotEmpty()
    public type: ActuatorType;
    @IsString()
    public name: string;
    @ValidateNested()
    @Type(() => ActuatorConfigDTO)
    public config: ActuatorConfigDTO;
    @IsOptional()
    @IsBoolean()
    public delete?: boolean = false;

    public static mapToActuatorModel(actuatorSynchronizeDTO: ActuatorSynchronizeDTO): SynchronizeActuatorModel {
        const actuatorModel = new SynchronizeActuatorModel();
        actuatorModel._id = actuatorSynchronizeDTO._id;
        actuatorModel.type = actuatorSynchronizeDTO.type;
        actuatorModel.name = actuatorSynchronizeDTO.name;
        actuatorModel.status = ModuleStatus.OFF;
        actuatorModel.config = actuatorSynchronizeDTO.type === ActuatorType.RPI
            ? Object.assign(new RpiActuatorConfigModel(), actuatorSynchronizeDTO.config)
            : Object.assign(new ComActuatorConfigModel(), actuatorSynchronizeDTO.config);
        actuatorModel.delete = actuatorSynchronizeDTO.delete ?? false;
        return actuatorModel;
    }
}

export class StructureSynchronizeDTO {

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CycleSynchronizeDTO)
    public cycles: CycleSynchronizeDTO[];
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SensorSynchronizeDTO)
    public sensors: SensorSynchronizeDTO[];

    public static mapToStructureModel(structureSynchronizeDTO: StructureSynchronizeDTO): StructureModel {

        const structureModel = new StructureModel();
        structureModel.cycles = [];
        structureModel.sensors = [];

        (structureSynchronizeDTO.cycles ?? []).forEach(cycle => {
            structureModel.cycles.push(CycleSynchronizeDTO.mapToCycleModel(cycle));
        });

        (structureSynchronizeDTO.sensors ?? []).forEach(cycle => {
            structureModel.sensors.push(SensorSynchronizeDTO.mapToSensorModel(cycle));
        });

        return structureModel;
    }
}



export class DeviceConfigDTO {
    // MASTER
    @ValidateIf(o => o.type === DeviceType.MASTER)
    @IsEnum(MasterProtocol)
    @ApiProperty({ description: "Protocole utilisé (TCP ou RTU)" })
    public protocol?: MasterProtocol;

    @ValidateIf(o => o.type === DeviceType.MASTER && o.protocol === MasterProtocol.TCP)
    @IsString()
    @ApiProperty({ description: "Adresse IP de l'équipement" })
    public ipAddress?: string;

    @ValidateIf(o => o.type === DeviceType.MASTER && o.protocol === MasterProtocol.TCP)
    @IsNumber()
    @ApiProperty({ description: "Port TCP Modbus (502 par défaut)" })
    public port?: number;

    @IsOptional()
    @IsNumber()
    @ApiProperty({ description: "baudrate" })
    public baudRate?: number;

    @IsOptional()
    @IsString()
    @ApiProperty({ description: "si rtu chemin" })
    public path?: string;

    @IsOptional()
    @IsNumber()
    @ApiProperty({ description: "timeout de connexion (ms)" })
    public timeout?: number;

    // SLAVE
    @ValidateIf(o => o.type === DeviceType.SLAVE)
    @IsNotEmpty()
    @IsNumber()
    @ApiProperty({ description: "Identifiant d’esclave Modbus (Slave ID)" })
    public slaveId?: number;

    @ValidateIf(o => o.type === DeviceType.SLAVE)
    @IsNotEmpty()
    @IsString()
    @ApiProperty({ description: "Identifiant du DeviceModel MASTER associé" })
    public masterDeviceId?: string;
}

export class DeviceSynchronizeDTO {
    public _id: string;

    @IsNotEmpty()
    @IsString()
    public name: string;

    @IsString()
    public description: string;

    @IsEnum(DeviceType)
    @IsNotEmpty()
    public type: DeviceType;

    @IsOptional()
    @IsEnum(DeviceKind)
    @ApiProperty({ description: "Nature de l'équipement (esclave Modbus générique, onduleur, ...)" })
    public kind?: DeviceKind;

    @ValidateNested()
    @Type(() => DeviceConfigDTO)
    public config: DeviceConfigDTO;
    @IsOptional()
    @IsBoolean()
    public delete?: boolean = false;

    // --- Méthode de mapping vers le modèle principal ---
    public static mapToDeviceModel(dto: DeviceSynchronizeDTO): SynchronizeDeviceModel {
        const model = new SynchronizeDeviceModel();
        model._id = dto._id;
        model.name = dto.name;
        model.description = dto.description;
        model.type = dto.type;
        model.kind = dto.kind;
        model.config = dto.type === DeviceType.MASTER
            ? Object.assign(new MasterConfigModel(), dto.config)
            : Object.assign(new SlaveConfigModel(), dto.config);
        model.delete = dto.delete ?? false;
        return model;
    }
}

export class ComRequestDTO {
    @IsOptional()
    @IsNotEmpty()
    @IsString()
    @ApiProperty({ description: "Identifiant unique de la requête" })
    public _id: string;

    @IsNotEmpty()
    @IsString()
    @ApiProperty({ description: "Identifiant de la connexion associée" })
    public deviceId: string;

    @IsNotEmpty()
    @IsString()
    @ApiProperty({ description: "Nom lisible ou étiquette de la requête" })
    public name: string;

    @IsOptional()
    @IsString()
    @ApiProperty({ description: "Description de la requête" })
    public description?: string;

    @IsArray()
    @ArrayNotEmpty()
    @IsEnum(ComRequestType, { each: true })
    @ApiProperty({ description: "Type(s) de la requête de communication", enum: ComRequestType, isArray: true })
    public type: ComRequestType[];

    @IsNotEmpty()
    @ValidateNested()
    @Type(() => ComRequestConfigDTO)
    @ApiProperty({ description: "Configuration Modbus (fonction, adresse, paramètres)" })
    public config: ComRequestConfigDTO;
    @IsOptional()
    @IsBoolean()
    public delete?: boolean = false;

    // --- Méthode de mapping vers le modèle principal ---
    public static mapToComRequestModel(dto: ComRequestDTO): SynchronizeComRequestModel {
        const model = new SynchronizeComRequestModel();
        model._id = dto._id;
        model.deviceId = dto.deviceId;
        model.name = dto.name;
        model.description = dto.description;
        model.type = dto.type;
        model.config = {
            function: dto.config.function,
            address: dto.config.address,
            disabled: dto.config.disabled,
            done: dto.config.done ?? false,
            params: dto.config.params || undefined
        };
        model.delete = dto.delete ?? false;
        return model;
    }
}

