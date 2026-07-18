import { ExecutableStatus } from '../interfaces/executable.interface';
import { ConditionModel } from './condition.model';
import { ComRequestConfigModel } from './com-request.model';

export interface ModuleTimingConfig {
    waitBeforeExec: number;
    waitAfterExec: number;
    waitBeforeExecOff: number;
    waitAfterExecOff: number;
}

export interface SequenceModuleRef {
    moduleId: string;
    configTiming: ModuleTimingConfig;
    customValue?: number;
}

export interface SecurityConfig {
    maxDuration: number;
    conditions?: ConditionModel[];
    customStacks?: { comRequestId: string; params?: ComRequestConfigModel; defaultParams?: ComRequestConfigModel }[];
}

export class SequenceModel {

    public _id: string;
    public cycleId: string;
    public name: string;
    public description: string;
    public progression: { startedAt: Date; duration: number };
    public status: ExecutableStatus = ExecutableStatus.STOPPED;

    // determine l'ordre d'execution des sequences d'un meme cycle (croissant)
    public order: number;
    public securityConfig: SecurityConfig = { maxDuration: undefined };
    // references vers des modules partages entre plusieurs sequences (moduleId + timings propres a cet usage)
    public moduleConfigs: SequenceModuleRef[] = [];

    public createdAt?: Date;
    public updatedAt?: Date;
    public deletedAt?: Date | null = null;

    public getActuatorIds(): string[] {
        return this.moduleConfigs.map((ref) => ref.moduleId);
    }
}
