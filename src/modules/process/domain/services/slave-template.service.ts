import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { DeviceKind, SlaveTemplate } from '../models/device.model';
import { RegisterMapTemplate } from '@register-map/domain/models/register-map.model';
import { SlaveTemplateRepository } from '@process/infrastructure/repositories/slave-template.repository';
import { DeviceCommandService } from './device-command.service';

@Injectable()
export class SlaveTemplateService {
    public constructor(
        private slaveTemplateRepository: SlaveTemplateRepository,
        private deviceCommandService: DeviceCommandService,
        private readonly logger: Logger
    ) { }

    /** Enregistre et renvoie le template avec les params (voie, valeur typée) de chaque commande */
    public async save(template: SlaveTemplate): Promise<SlaveTemplate> {
        const saved = await this.slaveTemplateRepository.save(this.deviceCommandService.withTemplateParams(template));
        this.logger.log({ templateId: saved._id, name: saved.name, kind: saved.kind }, 'slave template saved');
        return this.deviceCommandService.withTemplateParams(saved);
    }

    public async get(): Promise<SlaveTemplate[]> {
        return (await this.slaveTemplateRepository.get()).map((template) => this.deviceCommandService.withTemplateParams(template));
    }

    /**
     * Crée en base le modèle de chaque register map (register-maps/*.json) absent (par _id), avec une commande par
     * opération. Un modèle existant n'est jamais écrasé : les _id de ses commandes sont référencés (actionneurs,
     * sensors, séquences).
     */
    public async seed(): Promise<void> {
        const existing = new Set((await this.slaveTemplateRepository.get()).map((template) => template._id));
        const kinds = Object.values(DeviceKind) as string[];
        for (const registerMap of this.deviceCommandService.listTemplates().filter((t) => t._id && !existing.has(t._id))) {
            if (!kinds.includes(registerMap.kind)) {
                this.logger.warn({ templateId: registerMap._id, kind: registerMap.kind }, 'register map kind unknown, slave template not seeded');
                continue;
            }
            await this.save(this._fromRegisterMap(registerMap));
        }
    }

    // device : valeurs par défaut de la register map (ex: portConfig), nom et description du template sinon
    private _fromRegisterMap(registerMap: RegisterMapTemplate): SlaveTemplate {
        const { _id, name, description, kind, device } = registerMap;
        const label = name ?? kind;
        return {
            _id,
            name: label,
            description,
            kind: kind as DeviceKind,
            device: { name: label, description, ...(device as Partial<SlaveTemplate['device']>), kind: kind as DeviceKind },
            deviceCommands: this.deviceCommandService.fromRegisterMap(_id, registerMap)
        };
    }
}
