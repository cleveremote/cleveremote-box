import { BinaryValue, Gpio } from "onoff";
import { NotSwitchError } from "../errors/not-switch.error";
import { GPIODirection, GPIOEdge, ModuleStatus, ModuleType } from "../interfaces/structure.interface";


export class ModuleModel {
    public status: ModuleStatus;
    public instance: Gpio;
    public portNum: number;
    public direction: GPIODirection;
    public edge: GPIOEdge;
    private debounceTimeout: number = undefined;
    public activeLow: boolean = false;
    public reconfigureDirection: boolean = true;
    
    public configure() {
        this.instance.unexport();
        this.instance = new Gpio(this.portNum, this.direction, this.edge, { debounceTimeout : this.debounceTimeout, activeLow : this.activeLow, reconfigureDirection: this.reconfigureDirection });
    }

    public execute(action: number): void {
        if (this.instance.direction() === GPIODirection.OUT) {
            this.instance.writeSync(action as BinaryValue);
        }
        else {
            throw new NotSwitchError();
        }
    }
}
