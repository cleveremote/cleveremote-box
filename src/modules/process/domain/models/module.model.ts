
import { BinaryValue, Gpio } from 'onoff';
import { NotSwitchError } from '../errors/not-switch.error';
import { GPIODirection, GPIOEdge, ModuleStatus } from '../interfaces/structure.interface';

export type FakeGpio = { writeSync: (_value: number) => void; direction: () => GPIODirection; unexport: () => void; readSync: () => number };
export class ModuleModel {
    public status: ModuleStatus;
    public instance: Gpio | FakeGpio;
    public portNum: number;
    public direction: GPIODirection;
    public edge: GPIOEdge;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public debounceTimeout: number = undefined;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public activeLow: boolean = false;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public reconfigureDirection: boolean = true;

    public configure(): void {
        if (this.instance) {
            this.instance.unexport();
        }
        /* istanbul ignore next */
        if (Gpio.accessible) {
            const gpioOptions = { debounceTimeout: this.debounceTimeout, activeLow: this.activeLow, reconfigureDirection: this.reconfigureDirection };
            this.instance = new Gpio(this.portNum, this.direction, this.edge, gpioOptions);
        } else {
            this.instance = this._getFakeInstance();
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

    private _getFakeInstance(): FakeGpio {
        return {
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            writeSync: (_value): void => {
                // TODO document why this method 'writeSync' is empty
            },
            direction: (): GPIODirection => {
                return this.direction;
            },
            unexport: (): void => {
                // TODO document why this method 'unexport' is empty
            },
            readSync: (): number => {
                return this.status === ModuleStatus.ON ? 1 : 0;
            }
        }
    }
}
