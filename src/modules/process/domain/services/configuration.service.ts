/* eslint-disable max-lines-per-function */
import { Injectable } from '@nestjs/common';
import { StructureRepository } from '@process/infrastructure/repositories/structure.repository';
import { ExecutableStatus } from '../interfaces/executable.interface';
import { SequenceModel } from '../models/sequence.model';
import { StructureModel } from '../models/structure.model';
import { ScheduleModel } from '../models/schedule.model';
import { TriggerModel } from '../models/trigger.model';
import { BehaviorSubject } from 'rxjs';
import { StructureEntity } from '@process/infrastructure/entities/structure.entity';
import { SensorValueModel } from '../models/sensor-value.model';
import { ProcessValueModel } from '../models/proccess-value.model';
import { ValueRepository } from '@process/infrastructure/repositories/value.repository';
import { ValueModel } from '../models/value.model';
import { ProcessValueEntity } from '@process/infrastructure/entities/process-value.entity';
import { SensorModel } from '../models/sensor.model';
import { DataModel } from '../models/data.model';

@Injectable()
export class StructureService {
    public structure: StructureModel;
    public sequences: SequenceModel[];
    public schedules: ScheduleModel[];
    public triggers: TriggerModel[];
    public deviceListeners: { subject: BehaviorSubject<SensorValueModel | ProcessValueModel>, deviceId }[] = [];

    public constructor(
        private structureRepository: StructureRepository,
        private valueRepository: ValueRepository
    ) {
    }

    public async getStructure(): Promise<StructureModel> {
        return this.structureRepository.get().then((data) => {
            const structureModel = StructureEntity.mapToModel(data);
            this.structure = structureModel;
            let sequences: SequenceModel[] = [];
            let schedules: ScheduleModel[] = [];
            let triggers: TriggerModel[] = [];

            this.structure.cycles.forEach((cycle) => {
                this.deviceListeners.push({ subject: new BehaviorSubject<ProcessValueModel>(null), deviceId: cycle.id });
                sequences = sequences.concat(cycle.sequences);
                sequences = [...new Set([...sequences, ...cycle.sequences])];
                schedules = schedules.concat(cycle.schedules);
                schedules = [...new Set([...schedules, ...cycle.schedules])];
                triggers = triggers.concat(cycle.triggers);
                triggers = [...new Set([...triggers, ...cycle.triggers])];
            });

            this.sequences = sequences; 
            this.schedules = schedules;
            this.triggers = triggers; 

            return this.structure;
        }); 
    }

    public async getConfigurationWithStatus(): Promise<StructureModel> {
        const struc = await this.getStructure();
        const sequencesProc: ProcessValueEntity[] = await this.valueRepository.getValues('SEQUENCE') as ProcessValueEntity[];
        const cyclesProc: ProcessValueEntity[] = await this.valueRepository.getValues('CYCLE') as ProcessValueEntity[];

        cyclesProc?.forEach(cycle => {
            const structCycle = struc.cycles.find((x) => x.id === cycle.id);
            if (structCycle) {
                structCycle.status = ExecutableStatus[cycle.status];
                if (structCycle.status === ExecutableStatus.IN_PROCCESS) {
                    structCycle.progression = { duration: cycle.duration, startedAt: cycle.startedAt };
                }
            }
        });

        sequencesProc?.forEach(seq => {
            const sequences = struc.getSequences();
            const sequence = sequences.find((x) => x.id === seq.id);
            if (sequence) {
                sequence.status = ExecutableStatus[seq.status];
                if (sequence.status === ExecutableStatus.IN_PROCCESS) {
                    sequence.progression = { duration: seq.duration, startedAt: seq.startedAt };
                }
            }

        }); 
        return struc;
    }

    private async getData(query: any): Promise<DataModel[]> {
        return (await this.valueRepository.getData(query));
    }

    public async getStatus(type: string, query?: any): Promise<ProcessValueModel[] | SensorValueModel[] | ValueModel | DataModel[]> {
        if (type === "DATA" && query) {
            return this.getData(query);
        }

        const structValues = await this.valueRepository.getValues(type);
        switch (type) {
            case "PROCESS":
                return (structValues as ValueModel).processes || [];
            case "SENSORS":
                return (structValues as ValueModel).sensors || [];
            default:
                return await this.valueRepository.getValues(type);
        }
    }

}
