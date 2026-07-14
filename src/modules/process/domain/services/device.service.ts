import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { NotImplementedError } from '../errors/not-implemented.error';
import { DeviceModel, DeviceKind } from '../models/device.model';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { DEVICE_STRATEGIES, DeviceStrategy } from './device-strategies/device-strategy.interface';

@Injectable()
export class DeviceService {

    private readonly _strategies: Map<DeviceKind, DeviceStrategy>;

    public constructor(
        private readonly logger: Logger,
        private deviceRepository: DeviceRepository,
        @Inject(DEVICE_STRATEGIES) strategies: DeviceStrategy[]
    ) {
        this._strategies = new Map(strategies.map((strategy) => [strategy.kind, strategy]));
    }

    public async init(device: DeviceModel): Promise<void> {
        return this._resolveStrategy(device.kind).init(device);
    }

    public async reset(device: DeviceModel): Promise<void> {
        return this._resolveStrategy(device.kind).reset(device);
    }

    public async configure(device: DeviceModel): Promise<void> {
        return this._resolveStrategy(device.kind).configure(device);
    }

    public async write(device: DeviceModel, params: { name: string; value: number }): Promise<void> {
        return this._resolveStrategy(device.kind).write(device, params);
    }

    public async read(device: DeviceModel, params: { name: string; value: number }): Promise<number> {
        return this._resolveStrategy(device.kind).read(device, params);
    }

    private _resolveStrategy(kind?: DeviceKind): DeviceStrategy {
        const resolvedKind = kind ?? DeviceKind.MODBUS_SLAVE;
        const strategy = this._strategies.get(resolvedKind);
        if (!strategy) {
            throw new NotImplementedError(`DeviceService: unsupported device kind "${resolvedKind}"`);
        }
        return strategy;
    }

}
