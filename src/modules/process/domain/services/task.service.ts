/* eslint-disable max-lines-per-function */
import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { SocketIoClientProxyService } from '../../../../common/websocket/socket-io-client-proxy/socket-io-client-proxy.service';
import { ExecutableAction, ExecutableStatus, ProcessMode, ProcessType } from '../interfaces/executable.interface';
import { ExecutableType } from '../models/value.model';
import { CycleModel } from '../models/cycle.model';
import { TaskModel } from '../models/task.model';
import { ProcessModel } from '../models/process.model';
import { StructureService } from './configuration.service';
import { ScheduleService } from './schedule.service';
import { TriggerService } from './trigger.service';
import { ProcessService } from './execution.service';
import { TaskRepository } from '@process/infrastructure/repositories/task.repository';
import { ScheduleRepository } from '@process/infrastructure/repositories/schedule.repository';
import { TriggerRepository } from '@process/infrastructure/repositories/trigger.repository';
import { ProcessValueRepository } from '@process/infrastructure/repositories/process-value.repository';

@Injectable()
export class TaskService {
    public tasks: TaskModel[] = [];

    public constructor(
        private configurationService: StructureService,
        private scheduleService: ScheduleService,
        @Inject(forwardRef(() => TriggerService)) private triggerService: TriggerService,
        @Inject(forwardRef(() => ProcessService)) private processService: ProcessService,
        private taskRepository: TaskRepository,
        private scheduleRepository: ScheduleRepository,
        private triggerRepository: TriggerRepository,
        private processValueRepository: ProcessValueRepository,
        private wsService: SocketIoClientProxyService,
        private readonly logger: Logger
    ) { }

    public initialize(): void {
        this.tasks = this.configurationService.structure.tasks || [];
    }

    public initTask(task: TaskModel, isDeleted: boolean = false): TaskModel {
        this.logger.log({ taskId: task.id, isDeleted }, 'initTask');
        const index = this.tasks.findIndex(x => x.id === task.id);
        if (isDeleted && index !== -1) {
            this.tasks.splice(index, 1);
        } else if (index !== -1) {
            this.tasks[index] = task;
        } else {
            this.tasks.push(task);
        }
        return task;
    }

    public async restartAllTaskSchedules(): Promise<void> {
        for (const task of this.tasks) {
            for (const schedule of task.schedules) {
                const methode = async (): Promise<void> => {
                    setTimeout(async () => {
                        await this.scheduleService.clearAllSchedules();
                        if (!schedule.isPaused) {
                            await this.setActive(task, ExecutableAction.ON);
                        }
                    }, schedule.cron.after);
                };
                this.scheduleService.createSchedule(schedule, methode);
            }
        }
    }

    public async setActive(task: TaskModel, action: ExecutableAction): Promise<void> {
        this.logger.log({ taskId: task.id, action }, 'setActive task');
        task.isActive = action === ExecutableAction.ON;
        await this.taskRepository.save(task);

        const childCycles = this.configurationService.structure.cycles.filter(c => c.taskId === task.id);
        for (const cycle of childCycles) {
            if (!cycle.schedules.length && !cycle.triggers.length) {
                await this._activateStandaloneCycle(cycle, action);
            } else {
                await this._togglePauseState(cycle, action);
            }
        }

        await this._notifyStatus(task, action);
    }

    private async _activateStandaloneCycle(cycle: CycleModel, action: ExecutableAction): Promise<void> {
        const process = new ProcessModel();
        process.cycle = cycle;
        process.action = ExecutableAction.ON;
        process.mode = ProcessMode.MANUAL;
        if (action === ExecutableAction.ON) {
            process.type = ProcessType.FORCE;
            await this.processService.execute(process);
        } else {
            await this.processService.reset(process);
        }
    }

    private async _togglePauseState(cycle: CycleModel, action: ExecutableAction): Promise<void> {
        const isPaused = action === ExecutableAction.OFF;
        for (const schedule of cycle.schedules) {
            schedule.isPaused = isPaused;
            const saved = await this.scheduleRepository.save(schedule);
            await this.scheduleService.initSchedule(saved || schedule, false);
        }
        for (const trigger of cycle.triggers) {
            trigger.isPaused = isPaused;
            const saved = await this.triggerRepository.save(trigger);
            this.triggerService.initTrigger(saved || trigger, false);
        }
    }

    public async deactivateIfAllCyclesStopped(taskId: string): Promise<void> {
        const task = this.tasks.find(x => x.id === taskId);
        if (!task || !task.isActive) {
            return;
        }
        const childCycles = this.configurationService.structure.cycles.filter(c => c.taskId === taskId);
        const allStopped = childCycles.every(c => c.status === ExecutableStatus.STOPPED);
        if (allStopped) {
            task.isActive = false;
            await this.taskRepository.save(task);
            await this._notifyStatus(task, ExecutableAction.OFF);
        }
    }

    private async _notifyStatus(task: TaskModel, action: ExecutableAction): Promise<void> {
        const status = action === ExecutableAction.ON ? ExecutableStatus.IN_PROCCESS : ExecutableStatus.STOPPED;
        const data = { type: ExecutableType.TASK, id: task.id, status, mapSectionId: task.mapSectionId };
        await this.processValueRepository.save(data);
        await this.wsService.sendMessage({ pattern: 'agg/synchronize/status', data: JSON.stringify(data) }, true);
        await this.wsService.sendMessage({ pattern: 'agg/synchronize/status', data: JSON.stringify(data) }, false);
    }

}
