import { CycleModel } from './cycle.model';
import { IActuatorModule } from '../interfaces/actuator-module.interface';
import { SensorModel } from './sensor.model';
import { SequenceModel } from './sequence.model';
import { DeviceModel, SlaveTemplate } from './device.model';
import { ActuatorModel } from './actuator.model';
import { ControlLoopModel } from './control-loop.model';
import { InverterModel } from './inverter.model';
import { isRaspberryPi } from '../utils/platform.util';
import { GlobalSettingsModel } from './global-settings.model';
import { AccountModel } from './authentication.model';
export class StructureModel {
    // Modèles de slave, chacun avec ses DeviceCommand (params résolus)
    public models: SlaveTemplate[] = [];
    public devices: DeviceModel[] = [];
    public cycles: CycleModel[] = [];
    public sensors: SensorModel[] = [];
    public actuators: ActuatorModel[] = [];
    public controlLoops: ControlLoopModel[] = [];
    // éléments variateur (pilotés par les directives des séquences)
    public inverters: InverterModel[] = [];
    public values: any[] = [];
    // reglages globaux de la box (position, fuseau deduit, rangs, langue, version)
    public globalSettings: GlobalSettingsModel;
    // compte de la box (login, email de récupération, verrou) ; jamais de hash ; null si non initialisé
    public account: AccountModel | null = null;
    // box identifiée comme un Raspberry Pi (device tree)
    public isRPI: boolean = isRaspberryPi();
    public getModuleIds(): string[] {
        return this.cycles.flatMap((cycle) => cycle.getModuleIds());
    }

    public getModules(actuatorRegistry: Map<string, IActuatorModule>): IActuatorModule[] {
        let modules: IActuatorModule[] = [];
        this.cycles.forEach((cycle) => {
            modules = [...new Set([...modules, ...cycle.getModules(actuatorRegistry)])];
        });
        return modules;
    }

    public getSequences(): SequenceModel[] {
        let sequences: SequenceModel[] = [];
        this.cycles.forEach((cycle) => {
            sequences = sequences.concat(cycle.sequences);
            sequences = [...new Set([...sequences, ...cycle.sequences])];
        });
        return sequences;
    }
}
