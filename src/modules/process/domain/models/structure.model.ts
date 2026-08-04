import { CycleModel } from './cycle.model';
import { ComRequestModel } from './com-request.model';
import { IActuatorModule } from '../interfaces/actuator-module.interface';
import { SensorModel } from './sensor.model';
import { SequenceModel } from './sequence.model';
import { DeviceModel } from './device.model';
import { ActuatorModel } from './actuator.model';
export class StructureModel {
    public modbusTasks: ComRequestModel[] = [];
    public devices: DeviceModel[] = [];
    public cycles: CycleModel[] = [];
    public sensors: SensorModel[] = [];
    public actuators: ActuatorModel[] = [];
    public values: any[] = [];
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
