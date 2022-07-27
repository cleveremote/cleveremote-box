import { Injectable } from '@nestjs/common';
import { ConfigurationRepository } from '@process/infrastructure/repositories/configuration.repository';
import { CycleModel } from '../models/cycle.model';
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

}
