import { BinaryValue, Gpio } from "onoff";
import { NotSwitchError } from "../errors/not-switch.error";
import { GPIODirection, GPIOEdge, ModuleStatus } from "../interfaces/structure.interface";


export class ModuleModel {
    public status: ModuleStatus;
    public instance: Gpio | { writeSync: Function, direction: Function, unexport: Function, readSync: Function };
    public portNum: number;
    public direction: GPIODirection;
    public edge: GPIOEdge;
    private debounceTimeout: number = undefined;
    public activeLow: boolean = false;
    public reconfigureDirection: boolean = true;

    public configure() {
        if (this.instance) {
            this.instance.unexport();
        }
        if (Gpio.accessible) {
            this.instance = new Gpio(this.portNum, this.direction, this.edge, { debounceTimeout: this.debounceTimeout, activeLow: this.activeLow, reconfigureDirection: this.reconfigureDirection });
            // more real code here
        } else {
            this.instance = {
                writeSync: value => {
                    console.log('virtual gpio ' + this.portNum + ' now uses value: ' + value);
                },
                direction: () => {
                    console.log('virtual gpio ' + this.portNum + ' direction: ' + this.direction);
                },
                unexport: () => {
                    console.log('virtual gpio ' + this.portNum + ' free: ');
                },
                readSync: value => {
                    console.log('virtual gpio ' + this.portNum + ' now value is: ' + value);
                },
            };
        }
    }

    public execute(action: number): void {
        if (this.instance.direction() === GPIODirection.OUT) {
            this.instance.writeSync(action as BinaryValue);
            this.status = action === 1 ? ModuleStatus.ON : ModuleStatus.OFF;
        }
        else {
            throw new NotSwitchError();
        }
    }

    public read(): number {
        return this.instance.readSync();
    }
}
