import { Controller, Injectable, ParseArrayPipe, PipeTransform, UsePipes, ValidationError, ValidationPipe } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { CycleModel } from '@process/domain/models/cycle.model';
import { StructureModel } from '@process/domain/models/structure.model';
import { StructureService } from '@process/domain/services/configuration.service';
import { SynchronizeService } from '@process/domain/services/synchronize.service';
import { ConfigurationFetchUC } from '@process/use-cases/configuration-fetch.uc';
import { ValuesFetchUC } from '@process/use-cases/values-fetch.uc';
import { EventFetchUC } from '@process/use-cases/event-fetch.uc';
import { EventModel } from '@process/domain/models/event.model';
import { EventQueryDTO } from '../dto/event-query.dto';
import { CycleSynchronizeUC } from '@process/use-cases/cycle-synchronize.uc';
import { ConfigurationSynchronizeUC } from '@process/use-cases/configuration-synchronize.uc';
import { ScheduleSynchronizeUC } from '@process/use-cases/schedule-synchronize.uc';
import { ComRequestDTO, CycleSynchronizeDTO, DeviceSynchronizeDTO, ScheduleSynchronizeDTO, SensorSynchronizeDTO, StructureSynchronizeDTO, TriggerSynchronizeDTO, ValveSynchronizeDTO } from '../dto/synchronize.dto';
import { ActuatorSynchronizeDTO } from '../dto/synchronize.dto';
import { TriggerSynchronizeUC } from '@process/use-cases/trigger-synchronize.uc';
import { SensorSynchronizeUC } from '@process/use-cases/sensor-synchronize.uc';
import { SensorModel } from '@process/domain/models/sensor.model';
import { ScheduleModel } from '@process/domain/models/schedule.model';
import { TriggerModel } from '@process/domain/models/trigger.model';
import { DeviceModel } from '@process/domain/models/device.model';
import { ComRequestModel } from '@process/domain/models/com-request.model';
import { DeviceSynchronizeUC } from '@process/use-cases/device-synchronize.uc';
import { ModbusTaskSynchronizeUC } from '@process/use-cases/modbustask-synchronize.uc';
import { ValveSynchronizeUC } from '@process/use-cases/valve-synchronize.uc';
import { ActuatorSynchronizeUC } from '@process/use-cases/actuator-synchronize.uc';
import { ActuatorModel } from '@process/domain/models/actuator.model';
import { DeviceDiscoverUC } from '@process/use-cases/device-discover.uc';
import { DeviceService } from '@process/domain/services/device.service';
import { DiscoverDeviceDTO } from '../dto/discover.dto';

function flattenValidationErrors(errors: ValidationError[]): string[] {
    return errors.flatMap(error => [
        ...Object.values(error.constraints ?? {}),
        ...flattenValidationErrors(error.children ?? [])
    ]);
}

function validationExceptionFactory(errors: ValidationError[] | string): RpcException {
    const message = Array.isArray(errors) ? flattenValidationErrors(errors).join(', ') : errors;
    return new RpcException(message);
}

@Injectable()
class ToArrayPipe implements PipeTransform {
    public transform(value: unknown): unknown[] {
        return Array.isArray(value) ? value : [value];
    }
}

@Controller()
@UsePipes(new ValidationPipe({ transform: true, exceptionFactory: validationExceptionFactory }))
export class ConfigurationController {

    public constructor(
        private _configurationService: StructureService,
        private _synchronizeService: SynchronizeService,
        private _deviceService: DeviceService
    ) {
    }
    @MessagePattern(['box/synchronize/configuration'])
    public async synchronise(@Payload() configurationSynchronizeDTO: StructureSynchronizeDTO): Promise<StructureModel> {
        const uc = new ConfigurationSynchronizeUC(this._synchronizeService);
        const input = StructureSynchronizeDTO.mapToStructureModel(configurationSynchronizeDTO);
        return uc.execute(input);
    }

    @MessagePattern(['box/synchronize/device'])
    public async synchroniseDevice(
        @Payload(new ToArrayPipe(), new ParseArrayPipe({ items: DeviceSynchronizeDTO, exceptionFactory: validationExceptionFactory }))
            deviceSynchronizeDTOs: DeviceSynchronizeDTO[]
    ): Promise<DeviceModel[]> {
        const uc = new DeviceSynchronizeUC(this._synchronizeService);
        const input = deviceSynchronizeDTOs.map(DeviceSynchronizeDTO.mapToDeviceModel);
        return uc.execute(input);
    }

    @MessagePattern(['box/discover/device'])
    public async discoverDevice(
        @Payload() discoverDeviceDTO: DiscoverDeviceDTO
    ): Promise<DeviceModel[]> {
        const uc = new DeviceDiscoverUC(this._deviceService);
        return uc.execute(discoverDeviceDTO.masterId);
        return [];
    }

    @MessagePattern(['box/synchronize/comrequest'])
    public async synchroniseComRequest(
        @Payload(new ParseArrayPipe({ items: ComRequestDTO, exceptionFactory: validationExceptionFactory }))
            comRequestDTOs: ComRequestDTO[]
    ): Promise<ComRequestModel[]> {
        const uc = new ModbusTaskSynchronizeUC(this._synchronizeService);
        const input = comRequestDTOs.map(ComRequestDTO.mapToComRequestModel);
        return uc.execute(input);
    }

    @MessagePattern(['box/synchronize/cycle'])
    public async synchronisePartial(@Payload() cycleSynchronizeDTO: CycleSynchronizeDTO): Promise<CycleModel> {
        const uc = new CycleSynchronizeUC(this._synchronizeService);
        const input = CycleSynchronizeDTO.mapToCycleModel(cycleSynchronizeDTO);
        return uc.execute(input);
    }

    @MessagePattern(['box/synchronize/schedule'])
    public async synchroniseSchedule(@Payload() scheduleSynchronizeDTO: ScheduleSynchronizeDTO): Promise<ScheduleModel> {
        const uc = new ScheduleSynchronizeUC(this._synchronizeService);
        const input = ScheduleSynchronizeDTO.mapToScheduleModel(scheduleSynchronizeDTO);
        return uc.execute(input);
    }

    @MessagePattern(['box/synchronize/trigger'])
    public async synchroniseTrigger(@Payload() triggerSynchronizeDTO: TriggerSynchronizeDTO): Promise<TriggerModel> {
        const uc = new TriggerSynchronizeUC(this._synchronizeService);
        const input = TriggerSynchronizeDTO.mapToTriggerModel(triggerSynchronizeDTO);
        return uc.execute(input);
    }

    @MessagePattern(['box/synchronize/sensor'])
    public async synchroniseSensor(@Payload() sensorSynchronizeDTO: SensorSynchronizeDTO): Promise<SensorModel> {
        const uc = new SensorSynchronizeUC(this._synchronizeService);
        const input = SensorSynchronizeDTO.mapToSensorModel(sensorSynchronizeDTO);
        return uc.execute(input);
    }

    @MessagePattern(['box/synchronize/valve'])
    public async synchroniseValve(@Payload() valveSynchronizeDTO: ValveSynchronizeDTO): Promise<ActuatorModel> {
        const uc = new ValveSynchronizeUC(this._synchronizeService);
        const input = ValveSynchronizeDTO.mapToValveModel(valveSynchronizeDTO);
        return uc.execute(input);
    }

    @MessagePattern(['box/synchronize/actuator'])
    public async synchroniseActuator(
        @Payload(new ParseArrayPipe({ items: ActuatorSynchronizeDTO, exceptionFactory: validationExceptionFactory }))
            actuatorSynchronizeDTOs: ActuatorSynchronizeDTO[]
    ): Promise<ActuatorModel[]> {
        const uc = new ActuatorSynchronizeUC(this._synchronizeService);
        const input = actuatorSynchronizeDTOs.map(ActuatorSynchronizeDTO.mapToActuatorModel);
        return uc.execute(input);
    }

    @MessagePattern(['box/fetch/configuration'])
    public async getConfiguration(): Promise<string> {
        const uc = new ConfigurationFetchUC(this._configurationService);
        const response = await uc.execute()
        return JSON.stringify(response, (key, value) => {
            if (key === 'instance') return undefined;
            return value;
        });
    }

    @MessagePattern(['box/fetch/plan'])
    public async getPlan(): Promise<string> {
        const result = 'svg'
        return result;
    }

    @MessagePattern(['box/fetch/status'])
    public async getStatus(@Payload() data: any): Promise<string> {
        const uc = new ValuesFetchUC(this._configurationService);
        const response = await uc.execute(data.type)
        return JSON.stringify(response, (key, value) => {
            if (key === 'instance') return undefined;
            return value;
        });
    }

    @MessagePattern(['box/fetch/events'])
    public async getEvents(@Payload() eventQueryDTO: EventQueryDTO): Promise<EventModel[]> {
        const uc = new EventFetchUC(this._configurationService);
        return uc.execute(eventQueryDTO);
    }
}