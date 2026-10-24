import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DeviceCommandModel } from '@process/domain/models/device-command.model';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { DeviceCommand, DeviceCommandDocument } from '../schemas/device-command.schema';
import { DeviceCommandMapper } from '../schemas/mappers/device-command.mapper';
import { NOT_DELETED_FILTER, softDeleteUpdate } from '../schemas/soft-delete.util';

@Injectable()
export class DeviceCommandMongooseRepository {

    public constructor(@InjectModel(DeviceCommand.name) private commandModel: Model<DeviceCommandDocument>) { }

    public async create(model: DeviceCommandModel): Promise<DeviceCommandModel> {
        const created = await this.commandModel.create(DeviceCommandMapper.mapToSchema(model));
        return DeviceCommandMapper.mapToModel(created);
    }

    public async upsert(id: string, model: DeviceCommandModel): Promise<DeviceCommandModel> {
        const saved = await this.commandModel.findOneAndUpdate(
            { _id: id },
            DeviceCommandMapper.mapToSchema(model),
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        return DeviceCommandMapper.mapToModel(saved);
    }

    public async delete(id: string): Promise<boolean> {
        const deleted = await this.commandModel.findByIdAndUpdate(id, softDeleteUpdate());
        if (!deleted) {
            throw new ElementNotFoundExeception(id, 'delete', 'deviceCommand');
        }
        return true;
    }

    public async findById(id: string): Promise<DeviceCommandModel> {
        const command = await this.commandModel.findOne({ _id: id, ...NOT_DELETED_FILTER });
        return command ? DeviceCommandMapper.mapToModel(command) : null;
    }

    public async findAll(): Promise<DeviceCommandModel[]> {
        const commands = await this.commandModel.find(NOT_DELETED_FILTER);
        return commands.map(DeviceCommandMapper.mapToModel);
    }

    public async findByDeviceId(deviceId: string): Promise<DeviceCommandModel[]> {
        const commands = await this.commandModel.find({ deviceId, ...NOT_DELETED_FILTER });
        return commands.map(DeviceCommandMapper.mapToModel);
    }

}
