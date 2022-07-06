// import { NotificationModel } from 'src/modules/task/domain/models/notification.model';
// import { TaskService } from 'src/modules/task/domain/services/notification.service';

import { ProcessModel } from "@process/domain/models/process.model";
import { ProcessService } from "@process/domain/services/execution.service";

/**
 * # declenchement d'un process
 *
 * Permet le declenchement d'un process Cycle / Sequence
 *
 * @include ProcessService.execute
 *
*/
export class ProcessExecuteUC {
    public constructor(private executionService: ProcessService) { }

    public execute(process: ProcessModel): Promise<boolean> {
        return this.executionService.execute(process);
    }
}