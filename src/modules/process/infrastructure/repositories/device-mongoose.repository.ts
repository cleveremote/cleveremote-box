import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DeviceModel } from '@process/domain/models/device.model';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { Device, DeviceDocument } from '../schemas/device.schema';
import { DeviceMapper } from '../schemas/mappers/device.mapper';
import { NOT_DELETED_FILTER, softDeleteUpdate } from '../schemas/soft-delete.util';

@Injectable()
export class DeviceMongooseRepository {

    public constructor(@InjectModel(Device.name) private deviceModel: Model<DeviceDocument>) { }

    public async create(model: DeviceModel): Promise<DeviceModel> {
        const created = await this.deviceModel.create(DeviceMapper.mapToSchema(model));
        return DeviceMapper.mapToModel(created);
    }

    public async update(id: string, model: DeviceModel): Promise<DeviceModel> {
        const updated = await this.deviceModel.findByIdAndUpdate(id, DeviceMapper.mapToSchema(model), { new: true });
        if (!updated) {
            throw new ElementNotFoundExeception(id, 'update', 'device');
        }
        return DeviceMapper.mapToModel(updated);
    }

    public async upsert(id: string, model: DeviceModel): Promise<DeviceModel> {
        const saved = await this.deviceModel.findOneAndUpdate(
            { _id: id },
            DeviceMapper.mapToSchema(model),
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        return DeviceMapper.mapToModel(saved);
    }

    public async delete(id: string): Promise<boolean> {
        const deleted = await this.deviceModel.findByIdAndUpdate(id, softDeleteUpdate());
        if (!deleted) {
            throw new ElementNotFoundExeception(id, 'delete', 'device');
        }
        return true;
    }

    public async findById(id: string): Promise<DeviceModel> {
        const device = await this.deviceModel.findOne({ _id: id, ...NOT_DELETED_FILTER });
        return device ? DeviceMapper.mapToModel(device) : null;
    }

    public async findAll(): Promise<DeviceModel[]> {
        const devices = await this.deviceModel.find(NOT_DELETED_FILTER);
        return devices.map(DeviceMapper.mapToModel);
    }

}
