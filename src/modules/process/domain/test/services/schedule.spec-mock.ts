import { randomUUID } from 'node:crypto';
import { ScheduleModel } from '@process/domain/models/schedule.model';

export function CreateScheduleModel(overrides: Partial<ScheduleModel> = {}): ScheduleModel {
    const schedule = new ScheduleModel();
    schedule._id = randomUUID();
    schedule.cycleId = 'cycle-1';
    schedule.name = 'schedule';
    schedule.description = 'description';
    // 1er janvier, toujours loin dans le futur : jamais declenche pendant les tests
    schedule.cron = { pattern: '0 0 1 1 *' };
    schedule.isPaused = false;
    schedule.shouldConfirmation = false;
    return Object.assign(schedule, overrides);
}
