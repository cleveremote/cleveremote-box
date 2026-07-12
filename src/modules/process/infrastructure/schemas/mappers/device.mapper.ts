import { DeviceModel, DeviceType, MasterConfigModel, SlaveConfigModel } from '@process/domain/models/device.model';
import { Device, DeviceDocument } from '../device.schema';

export class DeviceMapper {

    private static _mapConfig(device: DeviceDocument): MasterConfigModel | SlaveConfigModel {
        if (device.type === DeviceType.MASTER) {
            const config = new MasterConfigModel();
            config.protocol = device.config.protocol;
            config.ipAddress = device.config.ipAddress;
            config.port = device.config.port;
            config.baudRate = device.config.baudRate;
            config.path = device.config.path;
            config.timeout = device.config.timeout;
            return config;
        }
        const config = new SlaveConfigModel();
        config.slaveId = device.config.slaveId;
        config.masterDeviceId = device.config.masterDeviceId;
        return config;
    }

    public static mapToModel(device: DeviceDocument): DeviceModel {
        const model = new DeviceModel();
        model._id = device._id;
        model.name = device.name;
        model.type = device.type;
        model.description = device.description;
        model.config = DeviceMapper._mapConfig(device);
        model.createdAt = (device as unknown as { createdAt?: Date }).createdAt;
        model.updatedAt = (device as unknown as { updatedAt?: Date }).updatedAt;
        model.deletedAt = device.deletedAt ?? null;
        return model;
    }

    public static mapToSchema(model: DeviceModel): Device {
        const device = new Device();
        device.name = model.name;
        device.type = model.type;
        device.description = model.description;
        if (model.type === DeviceType.MASTER) {
            const config = model.config as MasterConfigModel;
            device.config = {
                protocol: config.protocol,
                ipAddress: config.ipAddress,
                port: config.port,
                baudRate: config.baudRate,
                path: config.path,
                timeout: config.timeout
            };
        } else {
            const config = model.config as SlaveConfigModel;
            device.config = { slaveId: config.slaveId, masterDeviceId: config.masterDeviceId };
        }
        return device;
    }

}
