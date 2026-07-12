import { DeviceModel } from '@process/domain/models/device.model';
import { SynchronizeService } from '@process/domain/services/synchronize.service';

/**
 * # Synchronisation et enregistrement d'une liste de devices (MASTER ou SLAVE)
 *
 * @include SynchronizeService.synchronizeDeviceList
 *
*/
export class DeviceSynchronizeUC {
    public constructor(private synchronizeService: SynchronizeService) { }

    public execute(deviceModels: DeviceModel[]): Promise<DeviceModel[]> {
        return this.synchronizeService.synchronizeDeviceList(deviceModels);
    }
}
