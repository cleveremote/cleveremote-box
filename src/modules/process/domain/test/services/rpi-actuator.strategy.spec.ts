import { NotSwitchError } from '@process/domain/errors/not-switch.error';
import {
    GPIODirection,
    GPIOEdge,
    ModuleStatus
} from '@process/domain/interfaces/structure.interface';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { ActuatorModel, RpiActuatorConfigModel } from '@process/domain/models/actuator.model';
import { RpiActuatorStrategy } from '@process/domain/services/actuator-strategies/rpi-actuator.strategy';

function CreateActuatorRpiModel(): ActuatorModel & { config: RpiActuatorConfigModel } {
    const actuator = new ActuatorModel();
    actuator.type = ActuatorType.RPI;
    actuator.config = new RpiActuatorConfigModel();
    return actuator as ActuatorModel & { config: RpiActuatorConfigModel };
}

describe('RpiActuatorStrategy', () => {
    const strategy = new RpiActuatorStrategy({ warn: jest.fn() } as any);

    it('should configure a new actuator and expose a GPIO instance', async () => {
        const pump = CreateActuatorRpiModel();
        pump.status = ModuleStatus.OFF;
        pump.name = '16';
        pump.config.direction = GPIODirection.OUT;
        pump.config.edge = GPIOEdge.BOTH;

        await strategy.configure(pump);

        expect(pump.config.instance).toBeDefined();
    });

    it('should reconfigure an already configured actuator', async () => {
        const pump = CreateActuatorRpiModel();
        pump.status = ModuleStatus.OFF;
        pump.name = '16';
        pump.config.direction = GPIODirection.OUT;
        pump.config.edge = GPIOEdge.BOTH;

        await strategy.configure(pump);
        await strategy.configure(pump);

        expect(pump.config.instance).toBeDefined();
    });

    it('should switch a actuator on then off and read back its state', async () => {
        const pump = CreateActuatorRpiModel();
        pump.status = ModuleStatus.OFF;
        pump.name = '16';
        pump.config.direction = GPIODirection.OUT;
        pump.config.edge = GPIOEdge.BOTH;
        await strategy.configure(pump);

        await strategy.execute(pump, 1);
        expect(pump.status).toEqual(ModuleStatus.ON);
        expect(strategy.read(pump)).toEqual(1);

        await strategy.execute(pump, 0);
        expect(pump.status).toEqual(ModuleStatus.OFF);
        expect(strategy.read(pump)).toEqual(0);
        pump.config.instance.unexport();
    });

    it('should throw NotSwitchError when executing a actuator configured as IN', async () => {
        const pump = CreateActuatorRpiModel();
        pump.status = ModuleStatus.OFF;
        pump.name = '16';
        pump.config.direction = GPIODirection.IN;
        pump.config.edge = GPIOEdge.BOTH;
        await strategy.configure(pump);

        await expect(strategy.execute(pump, 1)).rejects.toThrow(NotSwitchError);
        pump.config.instance.unexport();
    });
});
