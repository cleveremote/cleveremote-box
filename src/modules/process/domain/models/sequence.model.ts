import { ExecutableStatus } from '../interfaces/executable.interface';
import { ConditionModel } from './condition.model';
import { DeviceCommandOverride } from './device-command.model';

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

export interface CustomStackModel {
    commandId: string;
    deviceId: string;
    params?: DeviceCommandOverride;
    defaultParams?: DeviceCommandOverride;
}

export interface SecurityConfig {
    maxDuration: number;
    conditions?: ConditionModel[];
    // DeviceCommand exécutée sur le slave deviceId au démarrage (params) et à l'arrêt (defaultParams) de la séquence
    customStacks?: CustomStackModel[];
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
