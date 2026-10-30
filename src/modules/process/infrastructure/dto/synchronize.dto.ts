/* eslint-disable max-lines-per-function */
/* eslint-disable max-lines */
import { ApiProperty } from '@nestjs/swagger';
import { CycleType, ExecutableAction, ExecutionMode, ProcessMode } from '@process/domain/interfaces/executable.interface';
import { ChildCycleRef } from '@process/domain/models/cycle.model';
import { ConditionConnector, ConditionOperator, ConditionParentType, ConditionSymbolEnd, ConditionSymbolStart } from '@process/domain/models/condition.model';
import { ElementType as ConditionElementType } from '@process/domain/models/event.model';
import { validateConditionStructure } from '@process/domain/utils/evaluate-conditions.util';
import { SunState, TimeDirection } from '@process/domain/interfaces/schedule.interface';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { GPIODirection, GPIOEdge, ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { ComSensorConfigModel, ForcastSensorConfigModel, forcastDataName } from '@process/domain/models/sensor.model';
import { StructureModel } from '@process/domain/models/structure.model';
import { ComActuatorConfigModel, RpiActuatorConfigModel, CtrlActuatorConfigModel } from '@process/domain/models/actuator.model';
import { DeviceType, DeviceKind, MasterConfigModel, MasterProtocol, SlaveConfigModel } from '@process/domain/models/device.model';
import { DeviceCommandType } from '@process/domain/models/device-command.model';
import {
    SynchronizeConditionModel,
    SynchronizeCycleModel,
    SynchronizeDeviceModel,
    SynchronizeDeviceCommandModel,
    SynchronizeActuatorModel,
    SynchronizeScheduleModel,
    SynchronizeSensorModel,
    SynchronizeSequenceModel,
    SynchronizeTriggerModel
} from '@process/domain/models/synchronize.model';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsBoolean, IsDate, IsDefined, isEmpty, IsEnum, IsIn, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Validate, ValidateIf, ValidateNested, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { isValidUuid } from '@process/domain/utils/id.util';
import { ElementType } from '@process/domain/models/event.model';
import { RegisterOperationParams, RegisterOperationValue } from '@register-map/domain/models/register-map.model';

@ValidatorConstraint({ name: 'condition-value', async: false })
export class IsConditionValue implements ValidatorConstraintInterface {
    public validate(value: unknown, args: ValidationArguments) {
        const condition = args.object as ConditionSync;
        if (condition.elementType === ConditionElementType.SENSOR) {
            return (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && !Number.isNaN(Number(value));
        }
        return value === ExecutableAction.ON || value === ExecutableAction.OFF;
    }

    public defaultMessage(args: ValidationArguments) {
        return '($value) must be numeric for a SENSOR condition, ON or OFF for a CYCLE/SEQUENCE condition';
    }
}

@ValidatorConstraint({ name: 'condition-expression', async: false })
export class IsValidConditionExpression implements ValidatorConstraintInterface {
    private error: string | null = null;

    public validate(conditions: ConditionSync[] | undefined) {
        this.error = Array.isArray(conditions) ? validateConditionStructure(conditions) : null;
        return this.error === null;
    }

    public defaultMessage() {
        return `invalid conditions expression: ${this.error}`;
    }
}

// surcharge voie / valeur d'une DeviceCommand (cf. DeviceCommandOverride)
export class DeviceCommandOverrideDTO {
    @IsOptional()
    @IsNumber()
    @ApiProperty({ description: 'Voie, 0-based (scope channel)', required: false })
    public channel?: number;

    // Forme dépendante de operation.input (nombre, tableau, champs composite) : validée à l'exécution par le template
    @IsOptional()
    @ApiProperty({ description: 'Valeur (selon operation.input)', required: false })
    public value?: RegisterOperationValue;
}

export class CustomStackSync {
    @IsString()
    @IsNotEmpty()
    public commandId: string;
    // slave sur lequel la commande est exécutée (du modèle de la commande)
    @IsString()
    @IsNotEmpty()
    public deviceId: string;
    @IsOptional()
    @ValidateNested()
    @Type(() => DeviceCommandOverrideDTO)
    public params?: DeviceCommandOverrideDTO;
    @IsOptional()
    @ValidateNested()
    @Type(() => DeviceCommandOverrideDTO)
    public defaultParams?: DeviceCommandOverrideDTO;
}

export class SecurityConfigSync {
    @IsNumber()
    public maxDuration: number = 60000;
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ConditionSync)
    @Validate(IsValidConditionExpression)
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
    @IsBoolean()
    public display?: boolean = true;
    @IsOptional()
    @ValidateNested()
    @Type(() => Style)
    public style?: Style = {
            bgColor: '#2196F3',
            fontColor: '#FFFFFF',
            iconColor: {
                icon: 'water-drop',
                base: '#1565C0'
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
    @Validate(IsValidConditionExpression)
    public conditions?: ConditionSync[];
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
        cycle.display = cycleSynchronizeDTO.display ?? true;

        cycle.type = cycleSynchronizeDTO.type ?? CycleType.CYCLE;
        cycle.executionMode = cycleSynchronizeDTO.executionMode ?? ExecutionMode.SEQUENTIAL;
        cycle.parentCycleId = cycleSynchronizeDTO.parentCycleId ?? null;
        cycle.conditions = (cycleSynchronizeDTO.conditions ?? []).map(ConditionSync.toModel);
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
                        commandId: customStackSync.commandId,
                        deviceId: customStackSync.deviceId,
                        ...(customStackSync.params !== undefined && { params: { ...customStackSync.params } }),
                        ...(customStackSync.defaultParams !== undefined && { defaultParams: { ...customStackSync.defaultParams } })
                    }))
                }),
                ...(sequenceSync.securityConfig.conditions !== undefined && {
                    conditions: sequenceSync.securityConfig.conditions.map(ConditionSync.toModel)
                })
            };
            // les modules (actuator-rpi/actuator-com) sont geres via leurs endpoints de sync dedies ;
            // ici on ne fait que reference leur id, avec un timing par defaut a 0.
            // une entree marquee delete:true est retiree du tableau : moduleConfigs n'est pas
            // soft-supprime individuellement, il est remplace en bloc sur la sequence (cf. SequenceMapper).
            sequence.moduleConfigs = (sequenceSync.moduleConfigs ?? [])
                .filter((moduleDto) => !moduleDto.delete)
                .map((moduleDto) => ({
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
            trigger.conditions = (triggerSync.conditions ?? []).map(ConditionSync.toModel);
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
            if (scheduleSync.cron?.sunBehavior) {
                scheduleModel.cron.sunBehavior = new SunBehavior();
                scheduleModel.cron.sunBehavior.sunState = scheduleSync.cron?.sunBehavior?.sunState;
                scheduleModel.cron.sunBehavior.timeDirection = scheduleSync.cron?.sunBehavior?.timeDirection;
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
    @IsEnum(TimeDirection)
    @IsNotEmpty()
    @ApiProperty()
    public timeDirection: TimeDirection;
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
        scheduleModel.cron.pattern = scheduleSynchronizeDTO.cron.pattern;
        if (scheduleSynchronizeDTO.cron.sunBehavior) {
            scheduleModel.cron.sunBehavior = new SunBehavior();
            scheduleModel.cron.sunBehavior.sunState = scheduleSynchronizeDTO.cron.sunBehavior.sunState;
            scheduleModel.cron.sunBehavior.timeDirection = scheduleSynchronizeDTO.cron.sunBehavior.timeDirection;
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
    @IsDefined()
    @Validate(IsConditionValue)
    public value: number | string;
    @IsEnum(ConditionOperator)
    public operator: ConditionOperator;
    @IsString()
    public elementId: string;
    @IsEnum(ElementType)
    public elementType: ElementType;
    @IsNumber()
    public order: number;
    @IsOptional()
    @IsEnum(ConditionConnector)
    public connector?: ConditionConnector;
    @IsOptional()
    @IsIn(Object.values(ConditionSymbolStart))
    public symbolStart?: ConditionSymbolStart;
    @IsOptional()
    @IsIn(Object.values(ConditionSymbolEnd))
    public symbolEnd?: ConditionSymbolEnd;
    @IsOptional()
    @IsString()
    public parentId?: string;
    @IsOptional()
    @IsEnum(ConditionParentType)
    public parentType?: ConditionParentType;
    // etat UI du builder, accepte mais non persiste
    @IsOptional()
    @IsBoolean()
    public isModified?: boolean;

    public static toModel(conditionSync: ConditionSync): SynchronizeConditionModel {
        const condition = new SynchronizeConditionModel();
        condition.elementId = conditionSync.elementId;
        condition.elementType = conditionSync.elementType;
        condition.operator = conditionSync.operator;
        condition.value = conditionSync.value;
        condition.order = conditionSync.order;
        condition.connector = conditionSync.connector;
        condition.symbolStart = conditionSync.symbolStart ?? ConditionSymbolStart.NONE;
        condition.symbolEnd = conditionSync.symbolEnd ?? ConditionSymbolEnd.NONE;
        condition.parentId = conditionSync.parentId;
        condition.parentType = conditionSync.parentType;
        return condition;
    }
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

    @IsOptional()
    @IsBoolean()
    public delete?: boolean = false;
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
    @Validate(IsValidConditionExpression)
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
            triggerModel.trigger.sunBehavior.timeDirection = triggerSynchronizeDTO.trigger.sunBehavior?.timeDirection;
            triggerModel.trigger.sunBehavior.time = triggerSynchronizeDTO.trigger?.sunBehavior?.time; //time befor or after sunset sunrise
        }
        triggerModel.conditions = (triggerSynchronizeDTO.conditions ?? []).map(ConditionSync.toModel);
        triggerModel.isPaused = triggerSynchronizeDTO.isPaused;
        return triggerModel;
    }

}

export class SensorConfigDTO {
    // requis pour FORCAST/COM ; absent quand le sensor est un enfant (field sans commandId)
    @ValidateIf(o => !o.field || !!o.commandId)
    @IsString()
    @IsNotEmpty()
    public cronPattern?: string;

    // FORCAST
    @ValidateIf(o => o.type === SensorType.FORCAST)
    @IsEnum(forcastDataName)
    public forcastData?: forcastDataName;

    // COM : DeviceCommand (register map)
    @ValidateIf(o => o.type === SensorType.COM)
    @IsString()
    @IsNotEmpty()
    public commandId?: string;
    // COM : slave sur lequel la commande est lue (du modèle de la commande)
    @ValidateIf(o => o.type === SensorType.COM)
    @IsString()
    @IsNotEmpty()
    public deviceId?: string;
    @IsOptional()
    @IsString()
    public field?: string;
}

export class SensorSynchronizeDTO {
    @IsOptional()
    @IsNotEmpty()
    public _id: string;
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
    public isEnabled?: boolean = true;
    @IsOptional()
    @IsBoolean()
    public display?: boolean = true;
    @IsOptional()
    @IsBoolean()
    public delete?: boolean = false;

    public static mapToSensorModel(sensorSynchronizeDTO: SensorSynchronizeDTO): SynchronizeSensorModel {
        const sensorModel = new SynchronizeSensorModel();
        sensorModel._id = sensorSynchronizeDTO._id;
        sensorModel.name = sensorSynchronizeDTO.name;
        sensorModel.description = sensorSynchronizeDTO.description;
        sensorModel.style = sensorSynchronizeDTO.style;
        sensorModel.type = sensorSynchronizeDTO.type;
        sensorModel.parentId = sensorSynchronizeDTO.parentId ?? null;
        sensorModel.isEnabled = sensorSynchronizeDTO.isEnabled ?? true;
        sensorModel.display = sensorSynchronizeDTO.display ?? true;
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
    // DeviceCommand (register map)
    @IsString()
    @IsNotEmpty()
    public commandId: string;

    @IsOptional()
    @IsNumber()
    public channel?: number;
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



export class PortConfigDTO {
    @IsNumber()
    @ApiProperty({ description: 'Numéro du premier port' })
    public portNumStart: number;

    @IsNumber()
    @ApiProperty({ description: 'Nombre de ports' })
    public portCount: number;
}

export class DeviceConfigDTO {
    // MASTER
    @ValidateIf(o => o.type === DeviceType.MASTER)
    @IsEnum(MasterProtocol)
    @ApiProperty({ description: 'Protocole utilisé (TCP ou RTU)' })
    public protocol?: MasterProtocol;

    @ValidateIf(o => o.type === DeviceType.MASTER && o.protocol === MasterProtocol.TCP)
    @IsString()
    @ApiProperty({ description: 'Adresse IP de l\'équipement' })
    public ipAddress?: string;

    @IsOptional()
    @IsString()
    @ApiProperty({ description: 'Identifiant matériel Waveshare, utilisé pour retrouver l\'IP (DHCP)' })
    public deviceId?: string;

    @ValidateIf(o => o.type === DeviceType.MASTER && o.protocol === MasterProtocol.TCP)
    @IsNumber()
    @ApiProperty({ description: 'Port TCP Modbus (502 par défaut)' })
    public port?: number;

    @IsOptional()
    @IsNumber()
    @ApiProperty({ description: 'baudrate' })
    public baudRate?: number;

    @IsOptional()
    @IsString()
    @ApiProperty({ description: 'si rtu chemin' })
    public path?: string;

    @IsOptional()
    @IsNumber()
    @ApiProperty({ description: 'timeout de connexion (ms)' })
    public timeout?: number;

    // SLAVE
    @ValidateIf(o => o.type === DeviceType.SLAVE)
    @IsNotEmpty()
    @IsNumber()
    @ApiProperty({ description: 'Identifiant d’esclave Modbus (Slave ID)' })
    public slaveId?: number;

    @ValidateIf(o => o.type === DeviceType.SLAVE)
    @IsNotEmpty()
    @IsString()
    @ApiProperty({ description: 'Identifiant du DeviceModel MASTER associé' })
    public masterDeviceId?: string;

    @IsOptional()
    @IsEnum(DeviceKind)
    @ApiProperty({ description: 'Nature de l\'équipement (esclave Modbus générique, onduleur, ...)', required: false })
    public kind?: DeviceKind;

    @IsOptional()
    @IsString()
    @ApiProperty({ description: 'Modèle (slave template) dont le slave partage les commandes', required: false })
    public modelId?: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => PortConfigDTO)
    @ApiProperty({ description: 'Configuration des ports de l\'équipement', required: false })
    public portConfig?: PortConfigDTO;
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

    @ValidateNested()
    @Type(() => DeviceConfigDTO)
    public config: DeviceConfigDTO;
    @IsOptional()
    @IsBoolean()
    public delete?: boolean = false;

    // devices slaves imbriques (recursif) : leur config.masterDeviceId sera ecrase cote serveur
    // avec l'_id reel de ce device parent au moment de la synchro.
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DeviceSynchronizeDTO)
    public slaveDevices?: DeviceSynchronizeDTO[];

    // --- Méthode de mapping vers le modèle principal ---
    public static mapToDeviceModel(dto: DeviceSynchronizeDTO): SynchronizeDeviceModel {
        const model = new SynchronizeDeviceModel();
        model._id = dto._id;
        model.name = dto.name;
        model.description = dto.description;
        model.type = dto.type;
        model.config = dto.type === DeviceType.MASTER
            ? Object.assign(new MasterConfigModel(), dto.config)
            : Object.assign(new SlaveConfigModel(), dto.config);
        model.delete = dto.delete ?? false;
        // undefined si non fourni par le client : ne pas defaulter a [] (voir synchronizeService._synchronizeDeviceTree)
        model.devices = dto.slaveDevices?.map(DeviceSynchronizeDTO.mapToDeviceModel);
        return model;
    }
}

// Champs d'une DeviceCommand hors identifiants (aussi utilisés par les slave templates)
export class DeviceCommandBaseDTO {
    @IsNotEmpty()
    @IsString()
    @ApiProperty({ description: 'Nom lisible de la commande' })
    public name: string;

    @IsOptional()
    @IsString()
    @ApiProperty({ description: 'Description de la commande', required: false })
    public description?: string;

    @IsNotEmpty()
    @IsString()
    @ApiProperty({ description: 'Identifiant du bloc (registerMap[].id)' })
    public blockId: string;

    @IsNotEmpty()
    @IsString()
    @ApiProperty({ description: 'Identifiant de l\'opération (registerMap[].operations[].id)' })
    public operationId: string;

    @IsOptional()
    @IsNumber()
    @ApiProperty({ description: 'Voie par défaut, 0-based (scope channel)', required: false })
    public channel?: number;

    // Forme dépendante de operation.input (nombre, tableau, champs composite) : validée à l'exécution par le template
    @IsOptional()
    @ApiProperty({ description: 'Valeur par défaut (selon operation.input)', required: false })
    public value?: RegisterOperationValue;

    @IsOptional()
    @IsBoolean()
    @ApiProperty({ description: 'Écriture persistante', required: false })
    public isPersistent?: boolean;

    @IsOptional()
    @IsBoolean()
    @ApiProperty({ description: 'Confirmation des opérations sensibles (bloc danger)', required: false })
    public isConfirmed?: boolean;

    @IsArray()
    @ArrayNotEmpty()
    @IsEnum(DeviceCommandType, { each: true })
    @ApiProperty({ enum: DeviceCommandType, isArray: true, description: 'Usages cumulables de la commande : set, read, init (initialisation du device), reset (remise à zéro du device)' })
    public types: DeviceCommandType[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @ApiProperty({ description: 'Lecture à champs : champs retenus (params.result.fields[].name), absent = tous', required: false, type: [String] })
    public fields?: string[];

    // Recalculé depuis la register map à l'enregistrement : la valeur reçue n'est conservée que si l'opération est introuvable
    @IsOptional()
    @IsObject()
    @ApiProperty({ description: 'Typage de la voie et de la valeur (listes, bornes) pour les formulaires', required: false })
    public params?: RegisterOperationParams;
}

export class DeviceCommandDTO extends DeviceCommandBaseDTO {
    @IsOptional()
    @IsNotEmpty()
    @IsString()
    @ApiProperty({ description: 'Identifiant unique de la commande' })
    public _id: string;

    @IsNotEmpty()
    @IsString()
    @ApiProperty({ description: 'Modèle (slave template) propriétaire, partagé par ses slaves (son kind désigne la register map)' })
    public modelId: string;

    @IsOptional()
    @IsBoolean()
    public delete?: boolean = false;

    public static mapToDeviceCommandModel(dto: DeviceCommandDTO): SynchronizeDeviceCommandModel {
        const model = new SynchronizeDeviceCommandModel();
        model._id = dto._id;
        model.modelId = dto.modelId;
        model.name = dto.name;
        model.description = dto.description;
        model.blockId = dto.blockId;
        model.operationId = dto.operationId;
        model.channel = dto.channel;
        model.value = dto.value;
        model.isPersistent = dto.isPersistent;
        model.isConfirmed = dto.isConfirmed;
        model.types = [...dto.types];
        model.fields = dto.fields && [...dto.fields];
        model.params = dto.params;
        model.delete = dto.delete ?? false;
        return model;
    }
}
