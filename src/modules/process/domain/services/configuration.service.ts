import { Injectable } from '@nestjs/common';
import { ConfigurationRepository } from '@process/infrastructure/repositories/configuration.repository';
import { SequenceModel } from '../models/sequence.model';
import { StructureModel } from '../models/structure.model';

@Injectable()
export class ConfigurationService {
    public structure: StructureModel;
    public sequences: SequenceModel[];
    public constructor(private structureRepository: ConfigurationRepository) {
    }

    public async synchronize(configuration: StructureModel): Promise<StructureModel> {
        return this.structureRepository.saveStructure(configuration).then((data) => {
            this.structure = data;
            return data;
        });
    }

    public async getConfiguration(): Promise<StructureModel> {
        return this.structureRepository.getStructure().then((data) => {
            this.structure = data;
            return data;
        });
    }

    public async getSequenceById(sequenceId) {
        const cycles = this.structure.cycles;

        let sequences: SequenceModel[] = [];
        cycles.forEach((cycle) => {
            sequences = sequences.concat(cycle.sequences);
            sequences = [...new Set([...sequences, ...cycle.sequences])];
        });
        this.sequences = sequences;

        this.sequences.find()
    }
}
