import { DeviceModel, DeviceWithCommands } from '@process/domain/models/device.model';
import { StructureService } from '@process/domain/services/configuration.service';
import { WaveshareDiscoveryService } from '@process/domain/services/waveshare-discovery.service';

/**
 * # Synchronisation et enregistrement d'une liste de devices (MASTER ou SLAVE)
 *
 * @include SynchronizeService.synchronizeDeviceList
 *
*/
export class DeviceDiscoverUC {
    public constructor(
        private configurationService: StructureService,
        private waveshareDiscoveryService: WaveshareDiscoveryService
    ) { }

    // sans master : masters Waveshare découverts ; avec master : slaves créés, avec leurs DeviceCommand
    public execute(masterDeviceId: string): Promise<DeviceModel[] | DeviceWithCommands[]> {
        if(!masterDeviceId) {
            return this.waveshareDiscoveryService.discover();
        }
        return this.configurationService.scanMaster(masterDeviceId);
    }
}
