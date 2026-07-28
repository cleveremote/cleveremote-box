import { DeviceModel } from '@process/domain/models/device.model';
import { DeviceService } from '@process/domain/services/device.service';
import { SynchronizeService } from '@process/domain/services/synchronize.service';

/**
 * # Synchronisation et enregistrement d'une liste de devices (MASTER ou SLAVE)
 *
 * @include SynchronizeService.synchronizeDeviceList
 *
*/
export class DeviceDiscoverUC {
    public constructor(private deviceService: DeviceService) { }

    public execute(masterDeviceId: string): Promise<DeviceModel[]> {
        return this.deviceService.discoverDevice(masterDeviceId);
    }
}
