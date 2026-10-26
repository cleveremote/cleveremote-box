import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import {
    AddressRange, DEVICE_KIND_SPECS, DeviceKind, DeviceModel, DeviceType, SlaveConfigModel, SlaveTemplate, getDeviceKindByAddress, getDiscoveryTargets
} from '@process/domain/models/device.model';
import { ModbusDeviceService } from '../../modbus-device.service';

// Module neuf détecté puis réadressé, prêt à être créé depuis son template
export interface ScannedSlave {
    template: SlaveTemplate;
    kind: DeviceKind;
    slaveId: number;
}

type DiscoveryResponse = { unitId: number; register: number; value: number };

@Injectable()
export class SlaveScanService {
    public constructor(
        private deviceRepository: DeviceRepository,
        private modbusDeviceService: ModbusDeviceService,
        private readonly logger: Logger
    ) { }

    /**
     * Scanne un Master : pour chaque type de DiscoveryAddressRegister, lit son registre sur le
     * premier unit id de sa plage (DEVICE_KIND_SPECS), réservé aux modules neufs. Quand un
     * module répond, la valeur lue est son adresse : sa plage donne le type. Le module est alors
     * réadressé sur le premier slaveId libre de la plage puis renvoyé avec son template.
     * Générateur : le module suivant n'est réadressé qu'une fois le précédent traité par l'appelant
     * (une erreur de l'appelant interrompt le scan).
     */
    public async *scan(masterDeviceId: string, templates: SlaveTemplate[]): AsyncGenerator<ScannedSlave> {
        const master = await this._getMaster(masterDeviceId);
        const existingSlaveIds = new Set(
            (await this.deviceRepository.getSlavesByMasterId(masterDeviceId))
                .map((slave) => (slave.config as SlaveConfigModel).slaveId)
        );

        const targets = getDiscoveryTargets().map(({ unitId, register }) => ({ unitId, register }));
        const responses = await this.modbusDeviceService.scanDiscoveryRegisters(master, targets);
        for (const response of responses) {
            const detected = this._identify(masterDeviceId, response, templates);
            if (!detected) continue;
            const newSlaveId = this._firstFreeSlaveId(detected.range, existingSlaveIds);
            if (newSlaveId === undefined) {
                this.logger.warn({ masterDeviceId, kind: detected.kind }, 'no free slaveId left in range');
                continue;
            }
            if (!await this._readdress(master, response, newSlaveId)) continue;
            yield { template: detected.template, kind: detected.kind, slaveId: newSlaveId };
            existingSlaveIds.add(newSlaveId);
        }
    }

    // Type du module (plage de l'adresse lue, cohérente avec le registre sondé) et son template ; undefined si inexploitable
    private _identify(masterDeviceId: string, { unitId, register, value: address }: DiscoveryResponse, templates: SlaveTemplate[]):
        { kind: DeviceKind; range: AddressRange; template: SlaveTemplate } | undefined {
        const kind = getDeviceKindByAddress(address);
        const spec = kind ? DEVICE_KIND_SPECS[kind] : undefined;
        if (!kind || !spec || spec.discoveryRegister !== register) {
            this.logger.warn({ masterDeviceId, unitId, register, address }, 'scanned address out of the range of its register type');
            return undefined;
        }
        const template = templates.find((t) => t.kind === kind);
        if (!template) {
            this.logger.warn({ masterDeviceId, address, kind }, 'no slave template for detected type');
            return undefined;
        }
        return { kind, range: spec.range, template };
    }

    // le premier unit id de la plage est réservé aux modules neufs
    private _firstFreeSlaveId({ min, max }: AddressRange, existingSlaveIds: Set<number>): number | undefined {
        let newSlaveId = min + 1;
        while (newSlaveId <= max && existingSlaveIds.has(newSlaveId)) newSlaveId++;
        return newSlaveId > max ? undefined : newSlaveId;
    }

    private async _readdress(master: DeviceModel, { unitId, register }: DiscoveryResponse, newSlaveId: number): Promise<boolean> {
        try {
            await this.modbusDeviceService.setSlaveAddress(master, register, unitId, newSlaveId);
            return true;
        } catch (err) {
            this.logger.error({ masterDeviceId: master._id, unitId, newSlaveId, err: err instanceof Error ? err.message : String(err) },
                'slave address write failed, module left unconfigured');
            return false;
        }
    }

    private async _getMaster(masterDeviceId: string): Promise<DeviceModel> {
        const master = await this.deviceRepository.get(masterDeviceId) as DeviceModel | null;
        if (!master || master.type !== DeviceType.MASTER) {
            throw new Error(`Master device ${masterDeviceId} not found or not of type MASTER`);
        }
        return master;
    }
}
