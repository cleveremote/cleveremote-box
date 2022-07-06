import { Injectable } from '@nestjs/common';
import { ConfigurationRepository } from '@process/infrastructure/repositories/configuration.repository';
import { StructureModel } from '../models/structure.model';

@Injectable()
export class ConfigurationService {
    public structure: StructureModel;
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
}
