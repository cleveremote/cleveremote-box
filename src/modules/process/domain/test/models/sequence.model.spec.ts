import { ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { GPIODirection, GPIOEdge, ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { IActuatorModule, ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { ActuatorModel, RpiActuatorConfigModel } from '@process/domain/models/actuator.model';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { ActuatorService } from '@process/domain/services/actuator.service';
import { RpiActuatorStrategy } from '@process/domain/services/actuator-strategies/rpi-actuator.strategy';
import { ComActuatorStrategy } from '@process/domain/services/actuator-strategies/com-actuator.strategy';

const logger = { warn: jest.fn() } as any;
const rpiActuatorStrategy = new RpiActuatorStrategy(logger);
const actuatorService = new ActuatorService(logger, {} as any, [rpiActuatorStrategy, new ComActuatorStrategy({ execute: jest.fn() } as never, { get: jest.fn() } as never)]);

function CreateActuatorRpiModel(): ActuatorModel & { config: RpiActuatorConfigModel } {
    const actuator = new ActuatorModel();
    actuator.type = ActuatorType.RPI;
    actuator.config = new RpiActuatorConfigModel();
    return actuator as ActuatorModel & { config: RpiActuatorConfigModel };
}

describe('SequenceModel model', () => {
    it('Should create a new sequence Model', async () => {
        const pump = CreateActuatorRpiModel();
        pump._id = 'pump';
        pump.status = ModuleStatus.OFF;
        pump.name = '16';
        pump.config.direction = GPIODirection.OUT;
        pump.config.edge = GPIOEdge.BOTH;
        await rpiActuatorStrategy.configure(pump);
        expect(pump.config.instance).toBeDefined();

        const valve1 = CreateActuatorRpiModel();
        valve1._id = 'valve1';
        valve1.status = ModuleStatus.OFF;
        valve1.name = '26';
        valve1.config.direction = GPIODirection.OUT;
        valve1.config.edge = GPIOEdge.BOTH;
        await rpiActuatorStrategy.configure(valve1);
        expect(valve1.config.instance).toBeDefined();

        const registry = new Map<string, IActuatorModule>([[pump._id, pump], [valve1._id, valve1]]);

        const irrigationSecteur1 = new SequenceModel();
        irrigationSecteur1._id = '11';
        irrigationSecteur1.status = ExecutableStatus.STOPPED;
        irrigationSecteur1.securityConfig.maxDuration = 3000; //3 secondes
        irrigationSecteur1.moduleConfigs = [pump, valve1].map((actuator) => ({
            moduleId: actuator._id,
            configTiming: { waitBeforeExec: 0, waitAfterExec: 0, waitBeforeExecOff: 0, waitAfterExecOff: 0 }
        }));

        expect(irrigationSecteur1).toBeDefined();
        expect(irrigationSecteur1.getActuatorIds()).toBeDefined();
        irrigationSecteur1.getActuatorIds().forEach(moduleId => {
            const module = registry.get(moduleId);
            expect(module).toBeDefined();
            expect((module as ActuatorModel & { config: RpiActuatorConfigModel }).config.instance).toBeDefined();
        });
    });

    it('Should reset the modules referenced by a sequence', async () => {
        const pump = CreateActuatorRpiModel();
        pump._id = 'pump';
        pump.status = ModuleStatus.ON;
        pump.name = '16';
        pump.config.direction = GPIODirection.OUT;
        pump.config.edge = GPIOEdge.BOTH;
        await rpiActuatorStrategy.configure(pump);
        expect(pump.config.instance).toBeDefined();

        const valve1 = CreateActuatorRpiModel();
        valve1._id = 'valve1';
        valve1.status = ModuleStatus.ON;
        valve1.name = '26';
        valve1.config.direction = GPIODirection.OUT;
        valve1.config.edge = GPIOEdge.BOTH;
        await rpiActuatorStrategy.configure(valve1);
        expect(valve1.config.instance).toBeDefined();

        const registry = new Map<string, IActuatorModule>([[pump._id, pump], [valve1._id, valve1]]);

        const irrigationSecteur1 = new SequenceModel();
        irrigationSecteur1._id = '11';
        irrigationSecteur1.status = ExecutableStatus.STOPPED;
        irrigationSecteur1.securityConfig.maxDuration = 3000; //3 secondes
        irrigationSecteur1.moduleConfigs = [pump, valve1].map((actuator) => ({
            moduleId: actuator._id,
            configTiming: { waitBeforeExec: 0, waitAfterExec: 0, waitBeforeExecOff: 0, waitAfterExecOff: 0 }
        }));

        const modules = irrigationSecteur1.getActuatorIds().map((id) => registry.get(id));
        await actuatorService.reset(modules);

        modules.forEach(module => {
            expect(module.status).toEqual(ModuleStatus.OFF);
        });
    });
});
