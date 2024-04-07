/* eslint-disable max-lines-per-function */
import { Injectable } from '@nestjs/common';
import { ConfigurationRepository } from '@process/infrastructure/repositories/configuration.repository';
import { ProcessType, ExecutableAction, ProcessMode, ExecutableStatus } from '../interfaces/executable.interface';
import { ProcessModel } from '../models/process.model';
import { SequenceModel } from '../models/sequence.model';
import { StructureModel } from '../models/structure.model';
import { ScheduleModel } from '../models/schedule.model';
import { TriggerModel } from '../models/trigger.model';
import { BehaviorSubject } from 'rxjs';
import { SensorModel } from '../models/sensor.model';
import { IExecutableState, ISensorValue } from '../interfaces/structure-repository.interface';

@Injectable()
export class ConfigurationService {
    public structure: StructureModel;
    public sequences: SequenceModel[];
    public schedules: ScheduleModel[];
    public triggers: TriggerModel[];
    public deviceListeners: { subject: BehaviorSubject<ISensorValue | IExecutableState>, deviceId }[] = [];
    public constructor(private structureRepository: ConfigurationRepository) {
    }

    public async getConfiguration(): Promise<StructureModel> {
        return this.structureRepository.getStructure().then((data) => {
            this.structure = data;
            let sequences: SequenceModel[] = [];
            let schedules: ScheduleModel[] = [];
            let triggers: TriggerModel[] = [];
            this.structure.cycles.forEach((cycle) => {
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

            return data;
        });
    }

    public async getConfigurationWithStatus(): Promise<StructureModel> {
        const struc = await this.getConfiguration();
        const results = await this.structureRepository.getProcessesStatus();

        results.cycles.forEach(cycle => {
            const structCycle = struc.cycles.find((x) => x.id === cycle.id);
            structCycle.progression = { duration: cycle.duration, startedAt: cycle.startedAt };
            structCycle.status = ExecutableStatus[cycle.status];
        });

        results.sequences.forEach(seq => {
            const sequences = struc.getSequences();
            const sequence = sequences.find((x) => x.id === seq.id);
            sequence.progression = { duration: seq.duration, startedAt: seq.startedAt };
            sequence.status = ExecutableStatus[seq.status];
        });
        return struc;
    }

    public getAllCyles(): Array<ProcessModel> {
        const cycles = this.structure.cycles;
        const AllProcesses: Array<ProcessModel> = [];
        cycles.forEach(cycle => {
            const process = new ProcessModel();
            process.cycle = cycle;
            process.action = ExecutableAction.OFF;
            process.type = ProcessType.FORCE;
            process.mode = ProcessMode.MANUAL;
            AllProcesses.push(process);
        });
        return AllProcesses;
    }

    public getDevice(id: string): SensorModel {
        return this.structure.sensors.find(x => x.id === id);
    }

    public updateProcessesValues(data: any): Promise<any[]> {
        // return this.structureRepository.updateProcessesValues(data);
        return null;
    }

}
