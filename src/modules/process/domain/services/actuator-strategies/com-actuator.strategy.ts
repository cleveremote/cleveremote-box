import { Injectable } from '@nestjs/common';
import { ActuatorType } from '../../interfaces/actuator-module.interface';
import { ComActuatorConfigModel, ActuatorModel } from '../../models/actuator.model';
import { DeviceCommandType } from '../../models/device-command.model';
import { outcomeValues } from '../../utils/device-command.util';
import { ActuatorStrategy } from './actuator-strategy.interface';
import { DeviceCommandService } from '../device-command.service';

// Chaque appel n'exécute que les actions dont la commande porte son usage (init, set, read, reset).
// Erreur Modbus/réseau : loggée par RegisterMapService, non levée.
@Injectable()
export class ComActuatorStrategy implements ActuatorStrategy {
    public readonly type = ActuatorType.COM;

    public constructor(private deviceCommandService: DeviceCommandService) { }

    public async init(actuator: ActuatorModel): Promise<void> {
        await this.deviceCommandService.runActions(this._deviceId(actuator), this._actions(actuator), DeviceCommandType.INIT);
    }

    // `action` est la valeur saisie de l'opération (ex: outputs.set 0/1), validée par le template.
    public async set(actuator: ActuatorModel, action: number): Promise<void> {
        await this.deviceCommandService.runActions(this._deviceId(actuator), this._actions(actuator), DeviceCommandType.SET, action);
    }

    public async read(actuator: ActuatorModel): Promise<number> {
        const [read] = await this.deviceCommandService.actionsOfType(this._actions(actuator), DeviceCommandType.READ);
        if (!read) {
            throw new Error(`ComActuatorStrategy: actuator ${actuator._id} sans commande read`);
        }
        const outcome = await this.deviceCommandService.execute(read.command, this._deviceId(actuator), { channel: read.action.channel });
        return outcomeValues(outcome)[0]?.value;
    }

    // commandes reset de l'actionneur ; à défaut, coupure par set 0
    public async reset(actuator: ActuatorModel): Promise<void> {
        const actions = this._actions(actuator);
        if (!(await this.deviceCommandService.actionsOfType(actions, DeviceCommandType.RESET)).length) {
            return this.set(actuator, 0);
        }
        await this.deviceCommandService.runActions(this._deviceId(actuator), actions, DeviceCommandType.RESET);
    }

    // slave sur lequel les commandes (partagées par son modèle) sont exécutées
    private _deviceId(actuator: ActuatorModel): string {
        return (actuator.config as ComActuatorConfigModel).deviceId;
    }

    private _actions(actuator: ActuatorModel): ComActuatorConfigModel['actions'] {
        return (actuator.config as ComActuatorConfigModel).actions;
    }

}
