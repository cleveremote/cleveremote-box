import { DeviceModel, DeviceKind } from '../../models/device.model';

export const DEVICE_STRATEGIES = 'DEVICE_STRATEGIES';

export interface DeviceStrategy {
    kind: DeviceKind;
    init(device: DeviceModel): Promise<void>;
    reset(device: DeviceModel): Promise<void>;
    configure(device: DeviceModel): Promise<void>;
    write(device: DeviceModel, params: { name: string; value: number }): Promise<void>;
    read(device: DeviceModel, params: { name: string; value: number }): Promise<number>;
}
