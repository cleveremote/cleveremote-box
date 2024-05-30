import { Controller, UsePipes, ValidationPipe } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CycleModel } from '@process/domain/models/cycle.model';
import { StructureModel } from '@process/domain/models/structure.model';
import { StructureService } from '@process/domain/services/configuration.service';
import { SynchronizeService } from '@process/domain/services/synchronize.service';
import { ConfigurationFetchUC } from '@process/use-cases/configuration-fetch.uc';
import { CycleSynchronizeUC } from '@process/use-cases/cycle-synchronize.uc';
import { ConfigurationSynchronizeUC } from '@process/use-cases/configuration-synchronize.uc';
import { ScheduleSynchronizeUC } from '@process/use-cases/schedule-synchronize.uc';
import { CycleSynchronizeDTO, ScheduleSynchronizeDTO, SensorSynchronizeDTO, StructureSynchronizeDTO, TriggerSynchronizeDTO } from '../dto/synchronize.dto';
import { TriggerSynchronizeUC } from '@process/use-cases/trigger-synchronize.uc';
import { SensorSynchronizeUC } from '@process/use-cases/sensor-synchronize.uc';
import { SensorModel } from '@process/domain/models/sensor.model';
import { ScheduleModel } from '@process/domain/models/schedule.model';
import { TriggerModel } from '@process/domain/models/trigger.model';
import { AuthenticationService } from '@process/domain/services/authentication.service';
import { AuthenticationCheckUC } from '@process/use-cases/authentication-check.uc';
import { AuthenticationModel } from '@process/domain/models/authentication.model';

@Controller()
export class AuthenticationController {

    public constructor(
        private _AuthenticationService: AuthenticationService) {
    }

    @MessagePattern(['box/check/login'])
    public async checkLogin(@Payload() authenticationDto: AuthenticationModel): Promise<boolean> {
        const uc = new AuthenticationCheckUC(this._AuthenticationService);
        return await uc.execute(authenticationDto);
    }

    @MessagePattern(['box/check/connection'])
    public async checkConnection(): Promise<boolean> {
        return true;
    }
}