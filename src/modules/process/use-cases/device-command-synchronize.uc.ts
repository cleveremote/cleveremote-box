import { DeviceCommandModel } from '@process/domain/models/device-command.model';
import { SynchronizeDeviceCommandModel } from '@process/domain/models/synchronize.model';
import { SynchronizeService } from '@process/domain/services/synchronize.service';

/**
 * # Synchronisation et enregistrement d'une liste de commandes register map (remplaçant des requetes com)
 *
 * @include SynchronizeService.synchronizeDeviceCommandList
 *
*/
export class DeviceCommandSynchronizeUC {
    public constructor(private synchronizeService: SynchronizeService) { }

    public execute(models: SynchronizeDeviceCommandModel[]): Promise<DeviceCommandModel[]> {
        return this.synchronizeService.synchronizeDeviceCommandList(models);
    }
}
