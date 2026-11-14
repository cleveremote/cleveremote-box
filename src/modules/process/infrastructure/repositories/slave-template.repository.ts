import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { SlaveTemplate as SlaveTemplateModel } from '@process/domain/models/device.model';
import { DeviceCommandModel } from '@process/domain/models/device-command.model';
import { SlaveTemplate, SlaveTemplateDocument } from '../schemas/slave-template.schema';
import { SlaveTemplateMapper } from '../schemas/mappers/slave-template.mapper';
import { DeviceCommandRepository } from './device-command.repository';

@Injectable()
export class SlaveTemplateRepository {

    public constructor(
        @InjectModel(SlaveTemplate.name) private slaveTemplateModel: Model<SlaveTemplateDocument>,
        private deviceCommandRepository: DeviceCommandRepository
    ) { }

    public async get(): Promise<SlaveTemplateModel[]> {
        const templates = await this.slaveTemplateModel.find();
        return Promise.all(templates.map((template) => this._withCommands(template)));
    }

    public async getById(id: string): Promise<SlaveTemplateModel | null> {
        const template = await this.slaveTemplateModel.findById(id);
        return template ? this._withCommands(template) : null;
    }

    /**
     * Upsert par _id (généré si absent) : renvoyer le même template le met à jour. Ses commandes remplacent
     * celles du modèle (collection devicecommands) : _id conservé = mise à jour, absent = création, commande
     * existante absente = soft-supprimée.
     */
    public async save(model: SlaveTemplateModel): Promise<SlaveTemplateModel> {
        const saved = await this.slaveTemplateModel.findOneAndUpdate(
            { _id: model._id ?? randomUUID() },
            SlaveTemplateMapper.mapToSchema(model),
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        await this.deviceCommandRepository.replaceForModel(saved._id, model.deviceCommands.map((command) => ({ ...command } as DeviceCommandModel)));
        return this._withCommands(saved);
    }

    private async _withCommands(template: SlaveTemplateDocument): Promise<SlaveTemplateModel> {
        return SlaveTemplateMapper.mapToModel(template, await this.deviceCommandRepository.getByModelId(template._id));
    }

}
