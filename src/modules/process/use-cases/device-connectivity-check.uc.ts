import { DeviceConnectivityModel } from '@process/domain/models/device.model';
import { DeviceConnectivityService } from '@process/domain/services/device-connectivity.service';

/**
 * # Vérification de la connectivité des devices (MASTER et ses slaves, ou SLAVE seul)
 *
 * @include DeviceConnectivityService.checkConnectivity
 *
*/
export class DeviceConnectivityCheckUC {
    public constructor(
        private deviceConnectivityService: DeviceConnectivityService
    ) { }

    // sans device : tous les masters et leurs slaves
    public execute(deviceId?: string): Promise<DeviceConnectivityModel[]> {
        if (!deviceId) {
            return this.deviceConnectivityService.checkAll();
        }
        return this.deviceConnectivityService.checkConnectivity(deviceId);
    }
}
