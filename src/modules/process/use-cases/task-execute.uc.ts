import { ExecutableAction } from '@process/domain/interfaces/executable.interface';
import { StructureInvalidError } from '@process/domain/errors/structure-invalid.error';
import { TaskService } from '@process/domain/services/task.service';

/**
 * # declenchement manuel d'une Task (ON/OFF)
 *
 * Permet l'activation/desactivation manuelle d'une Task
 *
 * @include TaskService.setActive
 *
*/
export class TaskExecuteUC {
    public constructor(private taskService: TaskService) { }

    public execute(taskId: string, action: ExecutableAction): Promise<void> {
        const task = this.taskService.tasks.find(x => x.id === taskId);
        if (!task) {
            throw new StructureInvalidError();
        }
        return this.taskService.setActive(task, action);
    }
}
