import { SunBehavior } from '@process/infrastructure/dto/synchronize.dto';

export class ScheduleModel {
    public _id: string;
    public cycleId: string;
    public name: string;
    public description: string;
    public cron: { date?: Date; pattern?: string; sunBehavior?: SunBehavior};
    public isPaused: boolean;
    public shouldConfirmation: boolean;
    // duree en ms appliquee a chaque sequence du cycle quand isInheritedDuration=false ;
    // isInheritedDuration=true : on garde la maxDuration parametree dans le cycle.
    public duration?: number;
    public isInheritedDuration: boolean = true;

    public createdAt?: Date;
    public updatedAt?: Date;
    public deletedAt?: Date | null = null;

    // fallback retro-compat : un schedule sans flag mais avec une duree > 0 la surchargeait deja
    public static resolveIsInheritedDuration(isInheritedDuration: boolean | undefined | null, duration: number | undefined | null): boolean {
        return isInheritedDuration ?? !(duration > 0);
    }

    // duree a transmettre au process : undefined = heritage de la duree du cycle
    public static effectiveDuration(schedule: Pick<ScheduleModel, 'duration' | 'isInheritedDuration'>): number | undefined {
        const isInherited = ScheduleModel.resolveIsInheritedDuration(schedule.isInheritedDuration, schedule.duration);
        return isInherited ? undefined : schedule.duration;
    }
}
