
import { Injectable } from '@nestjs/common';
import { BinaryValue, Gpio } from 'onoff';
import { NotSwitchError } from '../errors/not-switch.error';
import { GPIODirection, GPIOEdge, ModuleStatus } from '../interfaces/structure.interface';
import { FakeGpio, ModuleModel } from '../models/module.model';

@Injectable()
export class ModuleService {

    public configure(moduleModel: ModuleModel): Gpio | FakeGpio {
        /* istanbul ignore next */
        if (Gpio.accessible) {
            const gpioOptions = {
                debounceTimeout: moduleModel.debounceTimeout,
                activeLow: moduleModel.activeLow,
                reconfigureDirection: moduleModel.reconfigureDirection
            };
            try {
                return new Gpio(moduleModel.portNum, moduleModel.direction, moduleModel.edge, gpioOptions);
            } catch (error) {
                return this._getFakeInstance(moduleModel);
            }
        } else {
            return this._getFakeInstance(moduleModel);
        }
    }

    public execute(moduleModel: ModuleModel, action: number): void {
        const instance = this.configure(moduleModel);
        if (instance.direction() === GPIODirection.OUT) {
            instance.writeSync(action as BinaryValue);
            moduleModel.status = action === 1 ? ModuleStatus.ON : ModuleStatus.OFF;
        }
        else {
            throw new NotSwitchError();
        }
    }

    public read(moduleModel: ModuleModel): number {
        const instance = this.configure(moduleModel);
        return instance.readSync();
    }

    private _getFakeInstance(moduleModel): FakeGpio {
        /* istanbul ignore next */
        return {
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            writeSync: (_value): void => {
                // TODO document why this method 'writeSync' is empty
            },
            direction: (): GPIODirection => {
                return moduleModel.direction;
            },
            unexport: (): void => {
                // TODO document why this method 'unexport' is empty
            },
            readSync: (): number => {
                return moduleModel.status === ModuleStatus.ON ? 1 : 0;
            }
        }
    }

}