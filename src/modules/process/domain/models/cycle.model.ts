import {
    ExecutableStatus,
    ExecutionMode,
    CycleType,
    IExecutable,
    SequenceExecutionEntry
} from '../interfaces/executable.interface';
import { ConditionModel } from './condition.model';
import { IActuatorModule } from '../interfaces/actuator-module.interface';
import { ScheduleModel } from './schedule.model';
import { ModuleTimingConfig, SequenceModel } from './sequence.model';
import { TriggerModel } from './trigger.model';

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

export class CycleModel implements IExecutable {
    public _id: string;
    public name: string;
    public type: CycleType = CycleType.CYCLE;
    public style: { bgColor: string; fontColor: string; iconColor: { icon: string; base: string } };
    public description: string;
    public display?: boolean = true;
    public status: ExecutableStatus = ExecutableStatus.STOPPED;
    public progression?: { startedAt: Date; duration: number };
    public sequences?: SequenceModel[] = [];
    public schedules?: ScheduleModel[] = [];
    public triggers?: TriggerModel[] = [];

    public executionMode?: ExecutionMode = ExecutionMode.SEQUENTIAL;
    public conditions?: ConditionModel[] = [];
    public parentCycleId?: string = null;
    public childCycles?: ChildCycleRef[] = [];

    public createdAt?: Date;
    public updatedAt?: Date;
    public deletedAt?: Date | null = null;

    public getModuleIds(): string[] {
        return this.sequences.flatMap((sequence) => sequence.getActuatorIds());
    }

    // variateurs pilotés par au moins une séquence du cycle
    public getInverterIds(): string[] {
        return [...new Set(this.sequences.flatMap((sequence) => sequence.getInverterIds?.() ?? []))];
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

    // Identité par _id : deux slaves du même modèle créent des actuators homonymes (ex: DO7)
    public exists(module: IActuatorModule, actuatorRegistry: Map<string, IActuatorModule>): boolean {
        return this.getModules(actuatorRegistry).some(x => x._id === module._id);
    }

    // Timings indexés par _id d'actuator
    public getModuleTimings(actuatorRegistry: Map<string, IActuatorModule>): Map<string, ModuleTimingConfig> {
        const timings = new Map<string, ModuleTimingConfig>();
        this.sequences.forEach((sequence) => {
            sequence.moduleConfigs.forEach((ref) => {
                const actuator = actuatorRegistry.get(ref.moduleId);
                if (actuator) {
                    timings.set(actuator._id, ref.configTiming);
                }
            });
        });
        return timings;
    }

    // duree prevue du cycle : somme des durees de sequence, surcharge comprise (meme regle que getExecutionStructure)
    public getPlannedDuration(overrideDuration?: number): number {
        return (this.sequences ?? []).reduce((total, sequence) =>
            total + Number(overrideDuration || sequence.securityConfig.maxDuration), 0);
    }

    public getExecutionStructure(overrideDuration: number | undefined, actuatorRegistry: Map<string, IActuatorModule>): SequenceExecutionEntry[] {
        const executionLst: SequenceExecutionEntry[] = [];
        const sequences: SequenceModel[] = [...this.sequences].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        sequences.forEach((sequence) => {
            const sequenceId = sequence._id;
            const moduleIds = sequence.getActuatorIds()
                .map((moduleId) => actuatorRegistry.get(moduleId)?._id)
                .filter((id): id is string => id !== undefined);
            // copie : ne pas ecrire la surcharge dans la structure partagee, sinon elle
            // persisterait pour les executions suivantes (duree heritee)
            const securityConfig = { ...sequence.securityConfig, maxDuration: overrideDuration || sequence.securityConfig.maxDuration };

            executionLst.push({ sequenceId, moduleIds, securityConfig });
        });
        return executionLst;
    }
}
