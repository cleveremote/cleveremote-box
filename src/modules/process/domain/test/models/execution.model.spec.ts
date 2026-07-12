import { ProcessType, ExecutableAction, ProcessMode, ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { GPIODirection, GPIOEdge, ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { CycleModel } from '@process/domain/models/cycle.model';
import { ProcessModel } from '@process/domain/models/process.model';
import { ActuatorModel, RpiActuatorConfigModel } from '@process/domain/models/actuator.model';
import { SequenceModel, SequenceModuleRef } from '@process/domain/models/sequence.model';
import { RpiActuatorStrategy } from '@process/domain/services/actuator-strategies/rpi-actuator.strategy';

const rpiActuatorStrategy = new RpiActuatorStrategy({ warn: jest.fn() } as any);

function CreateActuatorRpiModel(): ActuatorModel & { config: RpiActuatorConfigModel } {
    const actuator = new ActuatorModel();
    actuator.type = ActuatorType.RPI;
    actuator.config = new RpiActuatorConfigModel();
    return actuator as ActuatorModel & { config: RpiActuatorConfigModel };
}

function toModuleConfigs(actuators: ActuatorModel[]): SequenceModuleRef[] {
    return actuators.map((actuator) => ({
        moduleId: actuator._id,
        configTiming: { waitBeforeExec: 0, waitAfterExec: 0, waitBeforeExecOff: 0, waitAfterExecOff: 0 }
    }));
}

describe('ExecutionModel model', () => {

    it('Should create a new execution Cycle as task Model and execute It action:ON', async () => {
        const execution = new ProcessModel();

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

        const valve2 = CreateActuatorRpiModel();
        valve2._id = 'valve2';
        valve2.status = ModuleStatus.OFF;
        valve2.name = '19';
        valve2.config.direction = GPIODirection.OUT;
        valve2.config.edge = GPIOEdge.BOTH;
        await rpiActuatorStrategy.configure(valve2);
        expect(valve2.config.instance).toBeDefined();

        const valve3 = CreateActuatorRpiModel();
        valve3._id = 'valve3';
        valve3.status = ModuleStatus.OFF;
        valve3.name = '21';
        valve3.config.direction = GPIODirection.OUT;
        valve3.config.edge = GPIOEdge.BOTH;
        await rpiActuatorStrategy.configure(valve3);
        expect(valve3.config.instance).toBeDefined();

        const valve4 = CreateActuatorRpiModel();
        valve4._id = 'valve4';
        valve4.status = ModuleStatus.OFF;
        valve4.name = '20';
        valve4.config.direction = GPIODirection.OUT;
        valve4.config.edge = GPIOEdge.BOTH;
        await rpiActuatorStrategy.configure(valve4);
        expect(valve4.config.instance).toBeDefined();

        const irrigationSecteur1 = new SequenceModel();
        irrigationSecteur1._id = '11';
        irrigationSecteur1.status = ExecutableStatus.STOPPED;
        irrigationSecteur1.securityConfig.maxDuration = 1000; //3 secondes
        irrigationSecteur1.moduleConfigs = toModuleConfigs([pump, valve1]);

        const irrigationSecteur2 = new SequenceModel();
        irrigationSecteur2._id = '12';
        irrigationSecteur2.status = ExecutableStatus.STOPPED;
        irrigationSecteur2.securityConfig.maxDuration = 1000; //3 secondes
        irrigationSecteur2.moduleConfigs = toModuleConfigs([pump, valve2]);

        const irrigationSecteur3 = new SequenceModel();
        irrigationSecteur3._id = '13';
        irrigationSecteur3.status = ExecutableStatus.STOPPED;
        irrigationSecteur3.securityConfig.maxDuration = 1000; //3 secondes
        irrigationSecteur3.moduleConfigs = toModuleConfigs([pump, valve3]);

        const irrigationSecteur4 = new SequenceModel();
        irrigationSecteur4._id = '13';
        irrigationSecteur4.status = ExecutableStatus.STOPPED;
        irrigationSecteur4.securityConfig.maxDuration = 1000; //3 secondes
        irrigationSecteur4.moduleConfigs = toModuleConfigs([pump, valve4]);

        const cycle = new CycleModel();
        cycle._id = '1';
        cycle.status = ExecutableStatus.STOPPED;
        cycle.sequences = [irrigationSecteur1, irrigationSecteur2, irrigationSecteur3, irrigationSecteur4];

        execution.cycle = cycle;
        execution.action = ExecutableAction.ON;
        execution.type = ProcessType.FORCE;
        execution.mode = ProcessMode.MANUAL;
        expect(execution).toBeDefined();
    });

});
