import { DeviceConnectivityModel, DeviceKind, DeviceModel, DeviceType, MasterConfigModel, SlaveConfigModel } from '@process/domain/models/device.model';
import { Device, DeviceDocument } from '../device.schema';

export class DeviceMapper {

    private static _mapConfig(device: DeviceDocument): MasterConfigModel | SlaveConfigModel {
        if (device.type === DeviceType.MASTER) {
            const config = new MasterConfigModel();
            config.protocol = device.config.protocol;
            config.ipAddress = device.config.ipAddress;
            config.deviceId = device.config.deviceId;
            config.port = device.config.port;
            config.baudRate = device.config.baudRate;
            config.path = device.config.path;
            config.timeout = device.config.timeout;
            config.discoveryRegisters = device.config.discoveryRegisters;
            return config;
        }
        const config = new SlaveConfigModel();
        config.slaveId = device.config.slaveId;
        config.masterDeviceId = device.config.masterDeviceId;
        // 'INVERTER' : ancienne valeur de DeviceKind encore présente en base
        const kind = device.config.kind;
        config.kind = (kind as string) === 'INVERTER' ? DeviceKind.INVERTER_VEICHI_SI23_V1 : kind;
        config.modelId = device.config.modelId;
        config.initDoneCommandIds = device.config.initDoneCommandIds && [...device.config.initDoneCommandIds];
        if (device.config.portConfig) {
            config.portConfig = { portNumStart: device.config.portConfig.portNumStart, portCount: device.config.portConfig.portCount };
        }
        return config;
    }

    public static mapToModel(device: DeviceDocument): DeviceModel {
        const model = new DeviceModel();
        model._id = device._id;
        model.name = device.name;
        model.type = device.type;
        model.description = device.description;
        model.config = DeviceMapper._mapConfig(device);
        if (device.connectivity) {
            const { connected, changedAt, error } = device.connectivity;
            model.connectivity = Object.assign(new DeviceConnectivityModel(), { deviceId: device._id, connected, changedAt, error });
        }
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
                deviceId: config.deviceId,
                port: config.port,
                baudRate: config.baudRate,
                path: config.path,
                timeout: config.timeout,
                discoveryRegisters: config.discoveryRegisters
            };
        } else {
            const config = model.config as SlaveConfigModel;
            device.config = {
                slaveId: config.slaveId,
                masterDeviceId: config.masterDeviceId,
                kind: config.kind,
                modelId: config.modelId,
                initDoneCommandIds: config.initDoneCommandIds,
                portConfig: config.portConfig
            };
        }
        return device;
    }

}
