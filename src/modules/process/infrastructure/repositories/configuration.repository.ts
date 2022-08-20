import { IStructureRepository } from '@process/domain/interfaces/structure-repository.interface';
import { CycleModel } from '../../domain/models/cycle.model';
import { ModuleModel } from '../../domain/models/module.model';
import { SequenceModel } from '../../domain/models/sequence.model';
import { StructureModel } from '../../domain/models/structure.model';
import * as fs from 'fs/promises';
import { StructureEntity } from '../entities/structure.entity';
import { StructureInvalidError } from '@process/domain/errors/structure-invalid.error';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ConfigurationRepository implements IStructureRepository {

    public async getStructure(): Promise<StructureModel> {
        const structureEntity = new StructureEntity();
        structureEntity.configuration = await fs.readFile('./box.cfg', { encoding: 'utf8' });
        if (structureEntity.configuration) {
            return StructureEntity.mapToStructureModel(structureEntity);
        }
        throw new StructureInvalidError();
    }

    public async saveStructure(structureModel: StructureModel): Promise<StructureModel> {
        const entity = StructureEntity.mapToStructureEntity(structureModel);
        if (entity) {
            await fs.writeFile('./box.cfg', entity.configuration, { encoding: 'utf8' });
            return structureModel;
        }
        throw new StructureInvalidError();
    }

    public async insertProcessStatus(data: string): Promise<void> {
        await fs.writeFile('./processesStatus.data', data + '\r\n', { encoding: 'utf8', flag: 'a+' });
    }

    public async deleteProcessStatus(id: string): Promise<void> {
        const data = await fs.readFile('./processesStatus.data', { encoding: 'utf8' });
        const lines = data.split('\r\n');
        const index = lines.findIndex(x => x.indexOf(id) > -1);
        lines.splice(index, 1);
        const newData = lines.join('\r\n');
        await fs.writeFile('./processesStatus.data', newData, { encoding: 'utf8' });
    }

    public async getProcessesStatus(): Promise<any[]> {
        const data = await fs.readFile('./processesStatus.data', { encoding: 'utf8', flag: 'a+' });
        const lines = data.split('\r\n');
        const processStatus = []
        lines.forEach(line => {
            !!line && processStatus.push(JSON.parse(line))
        });

        return processStatus
    }


    public async getCycles(): Promise<CycleModel[]> {
        throw new Error('Method not implemented.');
    }

    public async getModules(): Promise<ModuleModel[]> {
        throw new Error('Method not implemented.');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async getCycle(_id: string): Promise<CycleModel> {
        throw new Error('Method not implemented.');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async getSequence(_id: string): Promise<SequenceModel> {
        throw new Error('Method not implemented.');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async getModule(_portNum: number): Promise<ModuleModel> {
        throw new Error('Method not implemented.');
    }

}