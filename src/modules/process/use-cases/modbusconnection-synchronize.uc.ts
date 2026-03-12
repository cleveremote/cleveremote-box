import { CycleModel } from '@process/domain/models/cycle.model';
import { ModbusConnectionConfigModel } from '@process/domain/models/modbusConnectionConfig.model';
import { SynchronizeService } from '@process/domain/services/synchronize.service';

/**
 * # Synchronisation et enregitrement de la nouvelle structure cycle/sequence
 *
 * Permet la synchronisation et enregitrement de la nouvelle structure cycle/sequence
 *
 * @include ConfigurationService.synchronize
 *
*/
export class ModbusConnectionSynchronizeUC {
    public constructor(private synchronizeService: SynchronizeService) { }

    public execute(modbusConnectionConfigModel: ModbusConnectionConfigModel): Promise<ModbusConnectionConfigModel> {
        return this.synchronizeService.synchronizeModbusConnection(modbusConnectionConfigModel);
    }
}