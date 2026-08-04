/* eslint-disable max-lines-per-function */
/* eslint-disable max-lines */
import { ApiProperty } from '@nestjs/swagger';
import { CycleType, ExecutableAction, ExecutionMode, ProcessMode } from '@process/domain/interfaces/executable.interface';
import { ChildCycleRef } from '@process/domain/models/cycle.model';
import { ConditionSymbolEnd, ConditionSymbolStart } from '@process/domain/models/condition.model';
import { SunState } from '@process/domain/interfaces/schedule.interface';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { GPIODirection, GPIOEdge, ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { ComSensorConfigModel, ForcastSensorConfigModel, forcastDataName } from '@process/domain/models/sensor.model';
import { StructureModel } from '@process/domain/models/structure.model';
import { ComActuatorConfigModel, RpiActuatorConfigModel, CtrlActuatorConfigModel } from '@process/domain/models/actuator.model';
import { DeviceType, DeviceKind, MasterConfigModel, MasterProtocol, SlaveConfigModel } from '@process/domain/models/device.model';
import { ModbusFunctionName, ModbusValueType } from '@process/domain/models/com-request.model';
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

export class DiscoverDeviceDTO {
    @IsOptional()
    @IsString()
    public masterId: string;
}

