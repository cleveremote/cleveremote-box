import { SunBehavior } from '@process/infrastructure/dto/synchronize.dto';
import { ConditionModel } from './condition.model';
import { ExecutableAction } from '../interfaces/executable.interface';

export class TriggerModel {
    public id: string;
    public cycleId: string;
    public name: string;
    public description: string;
    public conditions: ConditionModel[];
    public trigger: { timeAfter?: number; sunBehavior?: SunBehavior };
    public delay: number;
    public shouldConfirmation: boolean;
    public lastTriggeredAt: Date;
    public isPaused: boolean;
    public action: ExecutableAction;
    public isCheckInProgress: boolean;
    public shouldDelete: boolean;
}