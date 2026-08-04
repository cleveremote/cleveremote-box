import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GlobalSettingsModel } from '@process/domain/models/global-settings.model';
import { GlobalSettings, GlobalSettingsDocument } from '../schemas/global-settings.schema';
import { GlobalSettingsMapper } from '../schemas/mappers/global-settings.mapper';

@Injectable()
export class GlobalSettingsRepository {

    public constructor(
        @InjectModel(GlobalSettings.name) private globalSettingsModel: Model<GlobalSettingsDocument>
    ) { }

    public async get(): Promise<GlobalSettingsModel> {
        const globalSettings = await this.globalSettingsModel.findOne();
        return globalSettings ? GlobalSettingsMapper.mapToModel(globalSettings) : new GlobalSettingsModel();
    }

    public async update(entity: GlobalSettingsModel): Promise<GlobalSettingsModel> {
        const saved = await this.globalSettingsModel.findOneAndUpdate(
            {},
            GlobalSettingsMapper.mapToSchema(entity),
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        return GlobalSettingsMapper.mapToModel(saved);
    }

}
