import { Controller } from '@nestjs/common';
import { Ctx, MessagePattern, Payload } from '@nestjs/microservices';
import { ConfigurationService } from '@process/domain/services/configuration.service';
import { ConfigurationFetchUC } from '@process/use-cases/configuration-fetch.uc';
import { ConfigurationSynchronizeUC } from '@process/use-cases/configuration-synchronize.uc';
import { Socket } from 'socket.io-client';
import { SocketIoClientProxyService } from 'src/common/websocket/socket-io-client-proxy/socket-io-client-proxy.service';
import { ConfigurationSynchronizeDTO } from '../dto/configuration-synchronize.dto';

@Controller()
export class ConfigurationController {

    public constructor(
        private _configurationService: ConfigurationService,
        private readonly socketIoClientProxyService: SocketIoClientProxyService) {
    }

    @MessagePattern('synchronize/configuration')
    public async synchronise(@Payload() configurationSynchronizeDTO: ConfigurationSynchronizeDTO, @Ctx() client: Socket): Promise<any> {
        const uc = new ConfigurationSynchronizeUC(this._configurationService);
        const input = ConfigurationSynchronizeDTO.mapToNotificationModel(configurationSynchronizeDTO);
        return uc.execute(input);
    }

    @MessagePattern('fetch/configuration')
    public async getConfiguration(): Promise<any> {
        const uc = new ConfigurationFetchUC(this._configurationService);
        const response = await uc.execute()
        return JSON.stringify(response);
    }
}