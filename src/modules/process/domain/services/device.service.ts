import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { NotImplementedError } from '../errors/not-implemented.error';
import { DeviceModel, DeviceKind, DeviceType, MasterConfigModel, SlaveConfigModel } from '../models/device.model';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { DEVICE_STRATEGIES, DeviceStrategy } from './device-strategies/device-strategy.interface';
import { ModbusService } from './modbus.service';
import { DEFAULT_UNCONFIGURED_UNIT_ID } from '../utils/modbus-registers.util';

export interface SlaveDiscoveryHandle {
    stop: () => Promise<void>;
}

@Injectable()
export class DeviceService {

    private readonly _strategies: Map<DeviceKind, DeviceStrategy>;

    public constructor(
        private readonly logger: Logger,
        private deviceRepository: DeviceRepository,
        private modbusService: ModbusService,
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

    public async initAll(): Promise<void> {
        const deviceModel = await this.deviceRepository.get('8d6f3fe2-af41-405b-9523-a0a6fb589b70') as DeviceModel
        return this._resolveStrategy(deviceModel.kind).init(deviceModel);
    }

    /**
     * Démarre la surveillance de tous les devices MASTER enregistrés en base pour détecter un
     * nouveau module non configuré et lui attribuer automatiquement une adresse esclave. Un
     * watcher indépendant (setTimeout auto-replanifié) est lancé par Master : l'échec ou le
     * provisioning sur l'un ne met jamais en pause la surveillance des autres.
     */
    public async watchMasterDevicesForNewSlaves(pollIntervalMs = 3000): Promise<void> {
        const masters = await this.deviceRepository.getByType(DeviceType.MASTER);
        // opt-in par Master : sans discoveryRegisters renseigné, pas de watcher (pas de fallback
        // silencieux sur un registre par défaut) - cf. modbus-registers.util.ts.
        const eligibleMasters = masters.filter((master) => ((master.config as MasterConfigModel).discoveryRegisters?.length ?? 0) > 0);
        masters
            .filter((master) => !eligibleMasters.includes(master))
            .forEach((master) => this.logger.debug({ masterId: master._id }, 'slave discovery disabled: no discoveryRegisters configured'));

        if (eligibleMasters.length === 0) {
            this.logger.log('no master devices with discoveryRegisters configured, slave discovery not started');
            return;
        }

        eligibleMasters.map(async (master) => await this.discoverDevice(master._id));
    }

    // setTimeout auto-replanifié (jamais de setInterval) : ne planifie le prochain tick qu'une
    // fois le précédent terminé, pour ne jamais empiler deux sondes sur le même Master.
    public async discoverDevice(masterDeviceId: string): Promise<DeviceModel[]> {
        const master: DeviceModel = await this.deviceRepository.get(masterDeviceId) as DeviceModel;
        const detectedRegister = await this.modbusService.probeMasterForNewSlave(master);
        if (detectedRegister) {
            await this.addSlaveDevice(master, detectedRegister);
        }
        return this.deviceRepository.getSlavesByMasterId(master._id);
    }

    private async addSlaveDevice(master: DeviceModel, detectedRegister: number): Promise<DeviceModel> {
        const existingSlaves = await this.deviceRepository.getByType(DeviceType.SLAVE);
        const siblingIds = existingSlaves
            .filter((device) => (device.config as SlaveConfigModel).masterDeviceId === master._id)
            .map((device) => (device.config as SlaveConfigModel).slaveId)
            .filter((id) => !Number.isNaN(id));
        const newSlaveId = Math.max(DEFAULT_UNCONFIGURED_UNIT_ID, ...siblingIds) + 1;

        try {
            await this.modbusService.setSlaveAdress(master, detectedRegister, DEFAULT_UNCONFIGURED_UNIT_ID, newSlaveId)
            //await this._enqueue(() => client.writeRegister(detectedRegister, newSlaveId));
        } catch (err) {
            this.logger.error(
                { masterId: master._id, newSlaveId, register: detectedRegister, err: err.message },
                'new slave address write failed, device left unconfigured for retry'
            );
            return null;
        }

        const slaveConfig = new SlaveConfigModel();
        slaveConfig.slaveId = newSlaveId;
        slaveConfig.masterDeviceId = master._id;

        const slaveModel = new DeviceModel();
        slaveModel.name = `Slave ${newSlaveId} (auto-detected)`;
        slaveModel.type = DeviceType.SLAVE;
        slaveModel.kind = DeviceKind.MODBUS_SLAVE;
        slaveModel.description = `Auto-detected on master "${master.name}" via register 0x${detectedRegister.toString(16)}`;
        slaveModel.config = slaveConfig;

        try {
            const saved = await this.deviceRepository.save(slaveModel);
            this.logger.log({ masterId: master._id, deviceId: saved._id, newSlaveId }, 'new slave device provisioned');
            return slaveModel;
        } catch (err) {
            this.logger.error(
                { masterId: master._id, newSlaveId, err: err.message },
                'db save failed after address write, attempting rollback to unconfigured unit id'
            );
            try {
                await this.modbusService.setSlaveAdress(master, detectedRegister, newSlaveId, DEFAULT_UNCONFIGURED_UNIT_ID);
                this.logger.error({ masterId: master._id, newSlaveId }, 'rollback succeeded, device remains discoverable');
            } catch (rollbackErr) {
                this.logger.error(
                    { masterId: master._id, newSlaveId, err: rollbackErr.message },
                    'CRITICAL: rollback failed after db save failure - device now at an orphaned address, manual recovery required'
                );
            }
            return null;
        }
    }

}
