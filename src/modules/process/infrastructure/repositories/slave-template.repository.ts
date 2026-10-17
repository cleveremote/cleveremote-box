import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { SlaveTemplate as SlaveTemplateModel } from '@process/domain/models/device.model';
import { SlaveTemplate, SlaveTemplateDocument } from '../schemas/slave-template.schema';
import { SlaveTemplateMapper } from '../schemas/mappers/slave-template.mapper';

@Injectable()
export class SlaveTemplateRepository {

    public constructor(
        @InjectModel(SlaveTemplate.name) private slaveTemplateModel: Model<SlaveTemplateDocument>
    ) { }

    public async get(): Promise<SlaveTemplateModel[]> {
        const templates = await this.slaveTemplateModel.find();
        return templates.map(SlaveTemplateMapper.mapToModel);
    }

    /** Upsert par _id (généré si absent) : renvoyer le même template le met à jour */
    public async save(model: SlaveTemplateModel): Promise<SlaveTemplateModel> {
        const saved = await this.slaveTemplateModel.findOneAndUpdate(
            { _id: model._id ?? randomUUID() },
            SlaveTemplateMapper.mapToSchema(model),
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        return SlaveTemplateMapper.mapToModel(saved);
    }

}
