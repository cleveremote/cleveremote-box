import { Controller, Injectable, ParseArrayPipe, PipeTransform, UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { RpcErrorsFilter, RpcValidationExceptionFactory } from '@framework/errors/rpc-errors';
import { CycleModel } from '@process/domain/models/cycle.model';
import { StructureModel } from '@process/domain/models/structure.model';
import { StructureService } from '@process/domain/services/configuration.service';
import { GlobalSettingsService } from '@process/domain/services/global-settings.service';
import { SynchronizeService } from '@process/domain/services/synchronize.service';
import { ConfigurationFetchUC } from '@process/use-cases/configuration-fetch.uc';
import { ValuesFetchUC } from '@process/use-cases/values-fetch.uc';
import { EventFetchUC } from '@process/use-cases/event-fetch.uc';
import { EventModel } from '@process/domain/models/event.model';
import { CycleRunModel } from '@process/domain/models/cycle-history.model';
import { EventQueryDTO } from '../dto/event-query.dto';
import { EventPurgeDTO } from '../dto/event-purge.dto';
import { EventPurgeUC } from '@process/use-cases/event-purge.uc';
import { EventPurgeResultModel } from '@process/domain/models/event-purge.model';
import { CycleSynchronizeUC } from '@process/use-cases/cycle-synchronize.uc';
import { ConfigurationSynchronizeUC } from '@process/use-cases/configuration-synchronize.uc';
import { ScheduleSynchronizeUC } from '@process/use-cases/schedule-synchronize.uc';
import { CycleSynchronizeDTO, DeviceCommandDTO, DeviceSynchronizeDTO, ScheduleSynchronizeDTO, SensorSynchronizeDTO, StructureSynchronizeDTO, TriggerSynchronizeDTO, ValveSynchronizeDTO, ControlLoopSynchronizeDTO } from '../dto/synchronize.dto';
import { ActuatorSynchronizeDTO } from '../dto/synchronize.dto';
import { TriggerSynchronizeUC } from '@process/use-cases/trigger-synchronize.uc';
import { SensorSynchronizeUC } from '@process/use-cases/sensor-synchronize.uc';
import { SensorModel } from '@process/domain/models/sensor.model';
import { ScheduleModel } from '@process/domain/models/schedule.model';
import { TriggerModel } from '@process/domain/models/trigger.model';
import { DeviceConnectivityModel, DeviceModel, DeviceWithCommands } from '@process/domain/models/device.model';
import { DeviceSynchronizeUC } from '@process/use-cases/device-synchronize.uc';
import { DeviceCommandSynchronizeUC } from '@process/use-cases/device-command-synchronize.uc';
import { DeviceCommandModel } from '@process/domain/models/device-command.model';
import { ValveSynchronizeUC } from '@process/use-cases/valve-synchronize.uc';
import { ActuatorSynchronizeUC } from '@process/use-cases/actuator-synchronize.uc';
import { ActuatorModel } from '@process/domain/models/actuator.model';
import { ControlLoopSynchronizeUC } from '@process/use-cases/control-loop-synchronize.uc';
import { ControlLoopModel } from '@process/domain/models/control-loop.model';
import { DeviceDiscoverUC } from '@process/use-cases/device-discover.uc';
import { DeviceService } from '@process/domain/services/device.service';
import { CheckDeviceDTO, DiscoverDeviceDTO } from '../dto/discover.dto';
import { DeviceConnectivityCheckUC } from '@process/use-cases/device-connectivity-check.uc';
import { DeviceConnectivityService } from '@process/domain/services/device-connectivity.service';
import { WaveshareDiscoveryService } from '@process/domain/services/waveshare-discovery.service';

@Injectable()
class ToArrayPipe implements PipeTransform {
    public transform(value: unknown): unknown[] {
        return Array.isArray(value) ? value : [value];
    }
}

@Controller()
@UseFilters(new RpcErrorsFilter())
@UsePipes(new ValidationPipe({ transform: true, exceptionFactory: RpcValidationExceptionFactory }))
export class ConfigurationController {

    public constructor(
        private _configurationService: StructureService,
         private _waveshareDiscoveryService: WaveshareDiscoveryService    ,
        private _synchronizeService: SynchronizeService,
        private _deviceConnectivityService: DeviceConnectivityService,
        private _globalSettingsService: GlobalSettingsService
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
        @Payload(new ToArrayPipe(), new ParseArrayPipe({ items: DeviceSynchronizeDTO, exceptionFactory: RpcValidationExceptionFactory }))
            deviceSynchronizeDTOs: DeviceSynchronizeDTO[]
    ): Promise<DeviceModel[]> {
        const uc = new DeviceSynchronizeUC(this._synchronizeService);
        const input = deviceSynchronizeDTOs.map(DeviceSynchronizeDTO.mapToDeviceModel);
        return uc.execute(input);
    }

    @MessagePattern(['box/discover/device'])
    public async discoverDevice(
        @Payload() discoverDeviceDTO: DiscoverDeviceDTO
    ): Promise<DeviceModel[] | DeviceWithCommands[]> {
        const uc = new DeviceDiscoverUC(this._configurationService,this._waveshareDiscoveryService);
        return uc.execute(discoverDeviceDTO.masterId);
    }

    @MessagePattern(['box/check/device'])
    public async checkDevice(@Payload() checkDeviceDTO: CheckDeviceDTO): Promise<DeviceConnectivityModel[]> {
        const uc = new DeviceConnectivityCheckUC(this._deviceConnectivityService);
        return uc.execute(checkDeviceDTO?.deviceId);
    }

    @MessagePattern(['box/synchronize/device-command'])
    public async synchroniseDeviceCommand(
        @Payload(new ParseArrayPipe({ items: DeviceCommandDTO, exceptionFactory: RpcValidationExceptionFactory }))
            deviceCommandDTOs: DeviceCommandDTO[]
    ): Promise<DeviceCommandModel[]> {
        const uc = new DeviceCommandSynchronizeUC(this._synchronizeService);
        return uc.execute(deviceCommandDTOs.map(DeviceCommandDTO.mapToDeviceCommandModel));
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

    @MessagePattern(['box/synchronize/control-loop'])
    public async synchroniseControlLoop(@Payload() controlLoopSynchronizeDTO: ControlLoopSynchronizeDTO): Promise<ControlLoopModel> {
        const uc = new ControlLoopSynchronizeUC(this._synchronizeService);
        const input = ControlLoopSynchronizeDTO.mapToControlLoopModel(controlLoopSynchronizeDTO);
        return uc.execute(input);
    }

    @MessagePattern(['box/synchronize/actuator'])
    public async synchroniseActuator(
        @Payload(new ToArrayPipe(), new ParseArrayPipe({ items: ActuatorSynchronizeDTO, exceptionFactory: RpcValidationExceptionFactory }))
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
    // cycle ou deviceId absent (derniers runs tous cycles) : CycleRunModel[] ; capteur / sequence : EventModel[]
    public async getEvents(@Payload() eventQueryDTO: EventQueryDTO): Promise<EventModel[] | CycleRunModel[]> {
        const uc = new EventFetchUC(this._configurationService);
        return uc.execute({ ...eventQueryDTO, lang: eventQueryDTO.lang ?? this._globalSettingsService.language });
    }

    // deviceId : cycle (sequences comprises) ou capteur ; absent = purge globale. before : purge partielle
    @MessagePattern(['box/purge/events'])
    public async purgeEvents(@Payload() eventPurgeDTO: EventPurgeDTO): Promise<EventPurgeResultModel> {
        const uc = new EventPurgeUC(this._configurationService);
        return uc.execute(eventPurgeDTO);
    }
}