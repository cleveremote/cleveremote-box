import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { DeviceCommandRepository } from '@process/infrastructure/repositories/device-command.repository';
import { DeviceModel, DeviceType, DeviceWithCommands, SlaveTemplate } from '@process/domain/models/device.model';
import { DEFAULT_UNCONFIGURED_UNIT_ID } from '@process/domain/utils/modbus-registers.util';
import { DeviceCommandService } from '../../device-command.service';
import { ScannedSlave } from '../scan/slave-scan.service';
import { AutoCreationStrategyResolver } from './auto-creation-strategy.resolver';
import { SlaveBundle } from './auto-creation-strategy.interface';
import { SlaveBundlePersister } from './slave-bundle.persister';

export interface AutoCreationOptions {
    // devices déjà configurés (unicité du nom)
    existingDevices: DeviceModel[];
    // templates déjà chargés (évite de les relire pour résoudre les params des commandes)
    templates: SlaveTemplate[];
}

/**
 * Création d'un slave à partir de son template : construit le device, délègue les éléments rattachés
 * (actuators, cycles…) à la stratégie de son kind, puis persiste l'ensemble.
 */
@Injectable()
export class AutoCreationService {
    public constructor(
        private resolver: AutoCreationStrategyResolver,
        private persister: SlaveBundlePersister,
        private deviceCommandRepository: DeviceCommandRepository,
        private deviceCommandService: DeviceCommandService,
        private readonly logger: Logger
    ) { }

    // Slave rattaché au modèle `template` (enregistré, commandes avec _id) : il en partage les DeviceCommand
    public async build(template: SlaveTemplate, masterDeviceId: string, slaveId = DEFAULT_UNCONFIGURED_UNIT_ID,
        existingDevices: DeviceModel[] = []): Promise<SlaveBundle> {
        const device: DeviceModel = {
            _id: randomUUID(),
            name: this._uniqueDeviceName(template.device.name, DeviceType.SLAVE, existingDevices),
            description: template.device.description,
            type: DeviceType.SLAVE,
            config: {
                slaveId,
                masterDeviceId,
                kind: template.kind,
                modelId: template._id,
                initDoneCommandIds: [],
                portConfig: template.device.portConfig && { ...template.device.portConfig }
            },
            deletedAt: null
        };
        const elements = await this.resolver.resolve(template.kind).build({ device, template });
        return { device, ...elements };
    }

    // Slave persisté, renvoyé avec les DeviceCommand de son modèle (params résolus)
    public async createSlave({ template, kind, slaveId }: ScannedSlave, masterDeviceId: string,
        { existingDevices, templates }: AutoCreationOptions): Promise<DeviceWithCommands> {
        const { device } = await this.persister.save(await this.build(template, masterDeviceId, slaveId, existingDevices));
        const deviceCommands = await this.deviceCommandService.withParams(
            await this.deviceCommandRepository.getByModelId(template._id), templates);
        this.logger.log({ masterDeviceId, newSlaveId: slaveId, kind }, 'slave created from scan');
        return { ...device, deviceCommands };
    }

    // Ajoute un suffixe incrémental (" 1", " 2", ...) si un device du même type porte déjà ce nom
    private _uniqueDeviceName(baseName: string, type: DeviceType, devices: DeviceModel[]): string {
        const existing = new Set(
            devices
                .filter((d) => d.type === type && !d.deletedAt)
                .map((d) => d.name)
        );
        if (!existing.has(baseName)) return baseName;
        let index = 1;
        while (existing.has(`${baseName} ${index}`)) index++;
        return `${baseName} ${index}`;
    }
}
