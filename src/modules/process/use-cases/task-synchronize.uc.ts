import { TaskModel } from '@process/domain/models/task.model';
import { SynchronizeService } from '@process/domain/services/synchronize.service';

/**
 * # Synchronisation et enregitrement d'une Task (groupe de cycles)
 *
 * Permet la synchronisation et enregitrement d'une Task
 *
 * @include ConfigurationService.synchronize
 *
*/
export class TaskSynchronizeUC {
    public constructor(private synchronizeService: SynchronizeService) { }

    public execute(synchronizeTaskModel: TaskModel): Promise<TaskModel> {
        return this.synchronizeService.synchronizeTask(synchronizeTaskModel);
    }
}
