import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { NotSwitchError } from '../../errors/not-switch.error';
import { GPIODirection, ModuleStatus } from '../../interfaces/structure.interface';
import { ActuatorType } from '../../interfaces/actuator-module.interface';
import { FakeGpio, ActuatorModel, RpiActuatorConfigModel } from '../../models/actuator.model';
import { ActuatorStrategy } from './actuator-strategy.interface';
import { GpioBinaryValue, isGpioAvailable, loadGpio } from '../../utils/gpio.util';
import { resolveGpioLine } from 'src/common/tools/gpio-line';

@Injectable()
export class RpiActuatorStrategy implements ActuatorStrategy {
    public readonly type = ActuatorType.RPI;

    public constructor(private readonly logger: Logger) { }

    public async reset(actuator: ActuatorModel): Promise<void> {
        const config = actuator.config as RpiActuatorConfigModel;
        if (!config.instance) {
            await this.init(actuator);
        }
        if (config.instance.direction() !== GPIODirection.OUT) {
            throw new NotSwitchError();
        }
        config.instance.writeSync(0);
        actuator.status = ModuleStatus.OFF;
    }

    public async init(actuator: ActuatorModel): Promise<void> {
        const config = actuator.config as RpiActuatorConfigModel;
        if (config.instance) {
            config.instance.unexport();
        }
        /* istanbul ignore next */
        if (isGpioAvailable()) {
            const Gpio = loadGpio();
            const gpioOptions = {
                debounceTimeout: config.debounceTimeout,
                activeLow: config.activeLow,
                reconfigureDirection: config.reconfigureDirection
            };
            try {
                // rpiPin est un numero BCM : onoff attend le numero sysfs (base du gpiochip non nulle sur Pi 5 / noyaux recents)
                const gpioLine = await resolveGpioLine(config.rpiPin);
                config.instance = new Gpio(gpioLine, config.direction, config.edge, gpioOptions);
            } catch (error) {
                this.logger.warn({ error, name: actuator.name, rpiPin: config.rpiPin }, 'GPIO init failed, using fake instance');
                config.instance = this._getFakeInstance(actuator, config);
            }
        } else {
            config.instance = this._getFakeInstance(actuator, config);
        }
    }

    public async set(actuator: ActuatorModel, action: number): Promise<void> {
        if (!(actuator.config as RpiActuatorConfigModel).instance) {
            await this.init(actuator);
        }
        const config = actuator.config as RpiActuatorConfigModel;
        if (config.instance.direction() === GPIODirection.OUT) {
            config.instance.writeSync(action as GpioBinaryValue);
            actuator.status = action === 1 ? ModuleStatus.ON : ModuleStatus.OFF;
        }
        else {
            throw new NotSwitchError();
        }
    }

    public async read(actuator: ActuatorModel): Promise<number> {
        return (actuator.config as RpiActuatorConfigModel).instance.readSync();
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
