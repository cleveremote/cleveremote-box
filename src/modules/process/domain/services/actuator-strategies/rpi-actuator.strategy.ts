import * as fs from 'fs';
import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { BinaryValue, Gpio } from 'onoff';
import { NotSwitchError } from '../../errors/not-switch.error';
import { GPIODirection, ModuleStatus } from '../../interfaces/structure.interface';
import { ActuatorType } from '../../interfaces/actuator-module.interface';
import { FakeGpio, ActuatorModel, RpiActuatorConfigModel } from '../../models/actuator.model';
import { ActuatorStrategy } from './actuator-strategy.interface';

const GPIO_ROOT_PATH = '/sys/class/gpio/';

@Injectable()
export class RpiActuatorStrategy implements ActuatorStrategy {
    public readonly type = ActuatorType.RPI;

    // Sur Raspberry Pi 5, les GPIO du connecteur 40 broches sont exposees par le controleur RP1
    // sous un gpiochip dont la base sysfs n'est plus 0 (contrairement aux Pi < 5). Le numero BCM
    // stocke dans rpiPin doit donc etre decale de cette base pour cibler la bonne ligne sysfs,
    // sous peine d'un EINVAL a l'export.
    private static _rp1GpioBase: number = undefined;

    public constructor(private readonly logger: Logger) { }

    public async configure(actuator: ActuatorModel): Promise<void> {
        const config = actuator.config as RpiActuatorConfigModel;
        if (config.instance) {
            config.instance.unexport();
        }
        /* istanbul ignore next */
        if (Gpio.accessible) {
            const gpioOptions = {
                debounceTimeout: config.debounceTimeout,
                activeLow: config.activeLow,
                reconfigureDirection: config.reconfigureDirection
            };
            try {
                const gpioLine = this._resolveGpioLine(config.rpiPin);
                config.instance = new Gpio(gpioLine, config.direction, config.edge, gpioOptions);
            } catch (error) {
                this.logger.warn({ error, name: actuator.name, rpiPin: config.rpiPin }, 'GPIO init failed, using fake instance');
                config.instance = this._getFakeInstance(actuator, config);
            }
        } else {
            config.instance = this._getFakeInstance(actuator, config);
        }
    }

    public async execute(actuator: ActuatorModel, action: number): Promise<void> {
        if (!(actuator.config as RpiActuatorConfigModel).instance) {
            await this.configure(actuator);
        }
        const config = actuator.config as RpiActuatorConfigModel;
        if (config.instance.direction() === GPIODirection.OUT) {
            config.instance.writeSync(action as BinaryValue);
            actuator.status = action === 1 ? ModuleStatus.ON : ModuleStatus.OFF;
        }
        else {
            throw new NotSwitchError();
        }
    }

    public read(actuator: ActuatorModel): number {
        return (actuator.config as RpiActuatorConfigModel).instance.readSync();
    }

    private _resolveGpioLine(rpiPin: number): number {
        if (RpiActuatorStrategy._rp1GpioBase === undefined) {
            RpiActuatorStrategy._rp1GpioBase = this._detectRp1GpioBase();
        }
        return RpiActuatorStrategy._rp1GpioBase + rpiPin;
    }

    /* istanbul ignore next */
    private _detectRp1GpioBase(): number {
        try {
            const chips = fs.readdirSync(GPIO_ROOT_PATH).filter((entry) => entry.startsWith('gpiochip'));
            for (const chip of chips) {
                const label = fs.readFileSync(`${GPIO_ROOT_PATH}${chip}/label`, 'utf8').trim();
                if (label === 'pinctrl-rp1') {
                    return Number(fs.readFileSync(`${GPIO_ROOT_PATH}${chip}/base`, 'utf8').trim());
                }
            }
        } catch (error) {
            this.logger.warn({ error }, 'failed to detect RP1 gpiochip base, defaulting to 0');
        }
        return 0;
    }

    private _getFakeInstance(actuator: ActuatorModel, config: RpiActuatorConfigModel): FakeGpio {
        /* istanbul ignore next */
        return {
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            writeSync: (_value): void => {
                // TODO document why this method 'writeSync' is empty
            },
            direction: (): GPIODirection => {
                return config.direction;
            },
            unexport: (): void => {
                // TODO document why this method 'unexport' is empty
            },
            readSync: (): number => {
                return actuator.status === ModuleStatus.ON ? 1 : 0;
            }
        }
    }

}
