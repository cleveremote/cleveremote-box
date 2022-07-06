import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ConfigurationService } from '@process/domain/services/configuration.service';
import { ConfigurationSynchronizeUC } from '@process/use-cases/configuration-synchronize.uc';
import { ConfigurationSynchronizeDTO } from '../dto/configuration-synchronize.dto';

@Controller()
export class ConfigurationController {

    public constructor(
        private _configurationService: ConfigurationService) {
    }
    //public constructor(private readonly socketIoClientProxyService: SocketIoClientProxyService) { }

    @MessagePattern('synchronize/configuration')
    public async handleSendHello(@Payload() configurationSynchronizeDTO: ConfigurationSynchronizeDTO): Promise<void> {
        const uc = new ConfigurationSynchronizeUC(this._configurationService);
        const input = ConfigurationSynchronizeDTO.mapToNotificationModel(configurationSynchronizeDTO);
        await uc.execute(input);
    }
}