
import { BinaryValue, Gpio } from 'onoff';
import { NotSwitchError } from '../errors/not-switch.error';
import { GPIODirection, GPIOEdge, ModuleStatus } from '../interfaces/structure.interface';
import { getGPIO } from 'src/common/tools/find_gipio';

export type FakeGpio = { writeSync: (_value: number) => void; direction: () => GPIODirection; unexport: () => void; readSync: () => number };
export class ModuleModel {
    public id: string; 
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

    public async configure(): Promise<void> {
        if (this.instance) {
            this.instance.unexport();
        }
        /* istanbul ignore next */
        if (Gpio.accessible) {
            const gpioOptions = { debounceTimeout: this.debounceTimeout, activeLow: this.activeLow, reconfigureDirection: this.reconfigureDirection };
            try {
                const gpio = await getGPIO(this.portNum);
                this.instance = new Gpio(gpio, this.direction, this.edge, gpioOptions);
            } catch (error) {
                this.instance = this._getFakeInstance();
            }
        } else {
            this.instance = this._getFakeInstance(); 
        }
    }

    public async execute(action: number): Promise<void> {
        if(!this.instance){
            await this.configure();
        }
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
        /* istanbul ignore next */
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
