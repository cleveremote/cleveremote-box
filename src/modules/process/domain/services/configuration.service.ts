import { Injectable } from '@nestjs/common';
import { ConfigurationRepository } from '@process/infrastructure/repositories/configuration.repository';
import { ProcessType, ExecutableAction, ProcessMode, ExecutableStatus } from '../interfaces/executable.interface';
import { ProcessModel } from '../models/process.model';
import { SequenceModel } from '../models/sequence.model';
import { StructureModel } from '../models/structure.model';

@Injectable()
export class ConfigurationService {
    public structure: StructureModel;
    public sequences: SequenceModel[];
    public constructor(private structureRepository: ConfigurationRepository) {
    }

    public async getConfiguration(): Promise<StructureModel> {
        return this.structureRepository.getStructure().then((data) => {
            this.structure = data;
            let sequences: SequenceModel[] = [];
            this.structure.cycles.forEach((cycle) => {
                sequences = sequences.concat(cycle.sequences);
                sequences = [...new Set([...sequences, ...cycle.sequences])];
            });
            this.sequences = sequences;
            return data;
        });
    }

    public async getConfigurationWithStatus(): Promise<StructureModel> {
        const struc = await this.getConfiguration();
        // update configuration
        const statuss = await this.structureRepository.getProcessesStatus();
        statuss.forEach(({ type, id, status, startedAt, duration }) => {
            if (type === 'CYCLE') {
                const cycle = struc.cycles.find((x) => x.id === id);
                cycle.progression = { duration, startedAt };
                cycle.status = ExecutableStatus[status];
            } else {
                const sequences = struc.getSequences();
                const sequence = sequences.find((x) => x.id === id);
                sequence.progression = { duration, startedAt };
                sequence.status = ExecutableStatus[status];
            }
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
            process.function = 'string';
            process.mode = ProcessMode.MANUAL;
            AllProcesses.push(process);
        });
        return AllProcesses;
    }

}
