import {
    ConditionsLogic,
    ExecutableStatus,
    ExecutionMode,
    CycleType,
    IExecutable,
    ProcessMode
} from '../interfaces/executable.interface';
import { ConditionModel } from './condition.model';
import { IActuatorModule } from '../interfaces/actuator-module.interface';
import { ScheduleModel } from './schedule.model';
import { ModuleTimingConfig, SequenceModel } from './sequence.model';
import { TriggerModel } from './trigger.model';
import { ComRequestConfigModel } from './com-request.model';
import { SecurityConfig } from '@process/infrastructure/schemas/sequence.schema';

export interface ChildCycleConfig {
    order: number;
    waitForCompletion: boolean;
    delayBefore: number;
    delayAfter: number;
    isSkipped: boolean;
}

export interface ChildCycleRef {
    cycleId: string;
    config: ChildCycleConfig;
}

export interface ExecutionStructure {
    sequenceId: string;
    names: string[],
    duration:number,
    customStacks:{ comRequestId: string; params?: ComRequestConfigModel; defaultParams?: ComRequestConfigModel }[]
}

export class CycleModel implements IExecutable {
    public _id: string;
    public name: string;
    public type: CycleType = CycleType.CYCLE;
    public style: { bgColor: string; fontColor: string; iconColor: { icon: string; base: string } };
    public description: string;
    public status: ExecutableStatus = ExecutableStatus.STOPPED;
    public modePriority: { mode: ProcessMode; priority: number }[] = [];
    public progression?: { startedAt: Date; duration: number };
    public sequences?: SequenceModel[] = [];
    public schedules?: ScheduleModel[] = [];
    public triggers?: TriggerModel[] = [];

    public executionMode?: ExecutionMode = ExecutionMode.SEQUENTIAL;
    public conditions?: ConditionModel[] = [];
    public conditionsLogic?: ConditionsLogic = ConditionsLogic.AND;
    public parentCycleId?: string = null;
    public childCycles?: ChildCycleRef[] = []; 

    public createdAt?: Date;
    public updatedAt?: Date;
    public deletedAt?: Date | null = null;

    public getModuleIds(): string[] {
        return this.sequences.flatMap((sequence) => sequence.getActuatorIds());
    }

    public getModules(actuatorRegistry: Map<string, IActuatorModule>): IActuatorModule[] {
        let modules: IActuatorModule[] = [];
        this.sequences.forEach((sequence) => {
            const sequenceModules = sequence.getActuatorIds()
                .map((moduleId) => actuatorRegistry.get(moduleId))
                .filter((actuator): actuator is IActuatorModule => !!actuator);
            modules = [...new Set([...modules, ...sequenceModules])];
        });
        return modules;
    }

    public exists(module: IActuatorModule, actuatorRegistry: Map<string, IActuatorModule>): boolean {
        return !!this.getModules(actuatorRegistry).find(x => x.name === module.name);
    }

    public getModuleTimings(actuatorRegistry: Map<string, IActuatorModule>): Map<string, ModuleTimingConfig> {
        const timings = new Map<string, ModuleTimingConfig>();
        this.sequences.forEach((sequence) => {
            sequence.moduleConfigs.forEach((ref) => {
                const actuator = actuatorRegistry.get(ref.moduleId);
                if (actuator) {
                    timings.set(actuator.name, ref.configTiming);
                }
            });
        });
        return timings;
    }

    public getExecutionStructure(overrideDuration: number | undefined, actuatorRegistry: Map<string, IActuatorModule>): { sequenceId: string; names: string[]; securityConfig:SecurityConfig       }[] {
        const executionLst: { sequenceId: string; names: string[]; securityConfig:SecurityConfig }[] = [];
        const sequences: SequenceModel[] = [...this.sequences].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        sequences.forEach((sequence) => {
            const sequenceId = sequence._id;
            const names = sequence.getActuatorIds()
                .map((moduleId) => actuatorRegistry.get(moduleId)?.name)
                .filter((name): name is string => name !== undefined);
            const duration = overrideDuration || sequence.securityConfig.maxDuration;
            
            sequence.securityConfig.maxDuration = overrideDuration || sequence.securityConfig.maxDuration;
            const securityConfig = sequence.securityConfig; 
            
            executionLst.push({ sequenceId, names, securityConfig });
        });
        return executionLst;
    }
}
