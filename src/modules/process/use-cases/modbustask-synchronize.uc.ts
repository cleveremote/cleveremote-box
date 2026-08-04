import { ComRequestModel } from '@process/domain/models/com-request.model';
import { SynchronizeService } from '@process/domain/services/synchronize.service';

/**
 * # Synchronisation et enregistrement d'une liste de requetes com (modbus tasks)
 *
 * @include SynchronizeService.synchronizeModbusTaskList
 *
*/
export class ModbusTaskSynchronizeUC {
    public constructor(private synchronizeService: SynchronizeService) { }

    public execute(modbusTaskConfigModels: ComRequestModel[]): Promise<ComRequestModel[]> {
        return this.synchronizeService.synchronizeModbusTaskList(modbusTaskConfigModels);
    }
}
