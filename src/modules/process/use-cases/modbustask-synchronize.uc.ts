import { CycleModel } from '@process/domain/models/cycle.model';
import { ModbusConnectionConfigModel } from '@process/domain/models/modbusConnectionConfig.model';
import { ModbusTaskConfigModel } from '@process/domain/models/modbusTaskConfig.model';
import { SynchronizeService } from '@process/domain/services/synchronize.service';

/**
 * # Synchronisation et enregitrement de la nouvelle structure cycle/sequence
 *
 * Permet la synchronisation et enregitrement de la nouvelle structure cycle/sequence
 *
 * @include ConfigurationService.synchronize
 *
*/
export class ModbusTaskSynchronizeUC {
    public constructor(private synchronizeService: SynchronizeService) { }

    public execute(modbusTaskConfigModel: ModbusTaskConfigModel): Promise<ModbusTaskConfigModel> {
        return this.synchronizeService.synchronizeModbusTask(modbusTaskConfigModel);
    }
}