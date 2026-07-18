import { ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { GPIODirection, GPIOEdge, ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { IActuatorModule, ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { ActuatorModel, RpiActuatorConfigModel } from '@process/domain/models/actuator.model';
import { SequenceModel, SequenceModuleRef } from '@process/domain/models/sequence.model';
import { CycleModel } from '@process/domain/models/cycle.model';
import { ActuatorService } from '@process/domain/services/actuator.service';
import { RpiActuatorStrategy } from '@process/domain/services/actuator-strategies/rpi-actuator.strategy';
import { ComActuatorStrategy } from '@process/domain/services/actuator-strategies/com-actuator.strategy';

const logger = { warn: jest.fn() } as any;
const rpiActuatorStrategy = new RpiActuatorStrategy(logger);
const actuatorService = new ActuatorService(logger, {} as any, [rpiActuatorStrategy, new ComActuatorStrategy({ execute: jest.fn() } as never, { get: jest.fn() } as never)]);

async function createActuator(id: string, portNum: number, direction: GPIODirection): Promise<ActuatorModel & { config: RpiActuatorConfigModel }> {
    const actuator = new ActuatorModel();
    actuator.type = ActuatorType.RPI;
    actuator._id = id;
    actuator.status = ModuleStatus.OFF;
    actuator.name = String(portNum);
    actuator.config = new RpiActuatorConfigModel();
    actuator.config.direction = direction;
    actuator.config.edge = GPIOEdge.BOTH;
    await rpiActuatorStrategy.configure(actuator);
    expect(actuator.config.instance).toBeDefined();
    return actuator as ActuatorModel & { config: RpiActuatorConfigModel };
}

function toModuleConfigs(actuators: ActuatorModel[]): SequenceModuleRef[] {
    return actuators.map((actuator) => ({
        moduleId: actuator._id,
        configTiming: { waitBeforeExec: 0, waitAfterExec: 0, waitBeforeExecOff: 0, waitAfterExecOff: 0 }
    }));
}

function toRegistry(actuators: ActuatorModel[]): Map<string, IActuatorModule> {
    return new Map(actuators.map((actuator) => [actuator._id, actuator]));
}

describe('CyleModel model', () => {
    it('Should create a new cycle Model & check its struct validity', async () => {

        const pump = await createActuator('pump', 16, GPIODirection.OUT);
        const valve1 = await createActuator('valve1', 26, GPIODirection.OUT);
        const valve2 = await createActuator('valve2', 19, GPIODirection.OUT);
        const valve3 = await createActuator('valve3', 21, GPIODirection.OUT);
        const valve4 = await createActuator('valve4', 20, GPIODirection.OUT);
        const registry = toRegistry([pump, valve1, valve2, valve3, valve4]);

        const irrigationSecteur1 = new SequenceModel();
        irrigationSecteur1._id = '11';
        irrigationSecteur1.status = ExecutableStatus.STOPPED;
        irrigationSecteur1.securityConfig.maxDuration = 3000;
        irrigationSecteur1.moduleConfigs = toModuleConfigs([pump, valve1]);

        const irrigationSecteur2 = new SequenceModel();
        irrigationSecteur2._id = '12';
        irrigationSecteur2.status = ExecutableStatus.STOPPED;
        irrigationSecteur2.securityConfig.maxDuration = 10000;
        irrigationSecteur2.moduleConfigs = toModuleConfigs([pump, valve2]);

        const irrigationSecteur3 = new SequenceModel();
        irrigationSecteur3._id = '13';
        irrigationSecteur3.status = ExecutableStatus.STOPPED;
        irrigationSecteur3.securityConfig.maxDuration = 10000;
        irrigationSecteur3.moduleConfigs = toModuleConfigs([pump, valve3]);

        const irrigationSecteur4 = new SequenceModel();
        irrigationSecteur4._id = '13';
        irrigationSecteur4.status = ExecutableStatus.STOPPED;
        irrigationSecteur4.securityConfig.maxDuration = 10000;
        irrigationSecteur4.moduleConfigs = toModuleConfigs([pump, valve4]);

        const cycle = new CycleModel();
        cycle._id = '1';
        cycle.status = ExecutableStatus.STOPPED;
        cycle.sequences = [irrigationSecteur1, irrigationSecteur2, irrigationSecteur3, irrigationSecteur4];

        expect(cycle).toBeDefined();
        expect(cycle.sequences).toBeDefined();
        cycle.sequences.forEach(sequence => {
            expect(sequence).toBeDefined();
            const modules = sequence.getActuatorIds().map((id) => registry.get(id));
            expect(modules).toBeDefined();
            modules.forEach(module => {
                expect(module).toBeDefined();
                expect((module as ActuatorModel & { config: RpiActuatorConfigModel }).config.instance).toBeDefined();
            });
        });

    });

    it('Should create a new cycle Model & and exectStruct', async () => {
        const pump = await createActuator('pump', 16, GPIODirection.OUT);
        const valve1 = await createActuator('valve1', 26, GPIODirection.OUT);
        const valve2 = await createActuator('valve2', 19, GPIODirection.OUT);
        const valve3 = await createActuator('valve3', 21, GPIODirection.OUT);
        const valve4 = await createActuator('valve4', 20, GPIODirection.OUT);
        const registry = toRegistry([pump, valve1, valve2, valve3, valve4]);

        const irrigationSecteur1 = new SequenceModel();
        irrigationSecteur1._id = '11';
        irrigationSecteur1.status = ExecutableStatus.STOPPED;
        irrigationSecteur1.securityConfig.maxDuration = 10000;
        irrigationSecteur1.moduleConfigs = toModuleConfigs([pump, valve1]);

        const irrigationSecteur2 = new SequenceModel();
        irrigationSecteur2._id = '12';
        irrigationSecteur2.status = ExecutableStatus.STOPPED;
        irrigationSecteur2.securityConfig.maxDuration = 10000;
        irrigationSecteur2.moduleConfigs = toModuleConfigs([pump, valve2]);

        const irrigationSecteur3 = new SequenceModel();
        irrigationSecteur3._id = '13';
        irrigationSecteur3.status = ExecutableStatus.STOPPED;
        irrigationSecteur3.securityConfig.maxDuration = 10000;
        irrigationSecteur3.moduleConfigs = toModuleConfigs([pump, valve3]);

        const irrigationSecteur4 = new SequenceModel();
        irrigationSecteur4._id = '14';
        irrigationSecteur4.status = ExecutableStatus.STOPPED;
        irrigationSecteur4.securityConfig.maxDuration = 10000;
        irrigationSecteur4.moduleConfigs = toModuleConfigs([pump, valve4]);

        const cycle = new CycleModel();
        cycle._id = '1';
        cycle.status = ExecutableStatus.STOPPED;
        cycle.sequences = [irrigationSecteur1, irrigationSecteur2, irrigationSecteur3, irrigationSecteur4];

        const struct = cycle.getExecutionStructure(undefined, registry);
        const desiredStruct = [
            { sequenceId: '11', names: ['16', '26'], securityConfig: { maxDuration: 10000 } },
            { sequenceId: '12', names: ['16', '19'], securityConfig: { maxDuration: 10000 } },
            { sequenceId: '13', names: ['16', '21'], securityConfig: { maxDuration: 10000 } },
            { sequenceId: '14', names: ['16', '20'], securityConfig: { maxDuration: 10000 } }
        ];

        expect(struct).toMatchObject(desiredStruct);
    });

    it('Should create a new cycle Model & and get modules', async () => {

        const pump = await createActuator('pump', 16, GPIODirection.OUT);
        const valve1 = await createActuator('valve1', 26, GPIODirection.OUT);
        const valve2 = await createActuator('valve2', 19, GPIODirection.OUT);
        const valve3 = await createActuator('valve3', 21, GPIODirection.OUT);
        const valve4 = await createActuator('valve4', 20, GPIODirection.OUT);
        const registry = toRegistry([pump, valve1, valve2, valve3, valve4]);

        const irrigationSecteur1 = new SequenceModel();
        irrigationSecteur1._id = '11';
        irrigationSecteur1.status = ExecutableStatus.STOPPED;
        irrigationSecteur1.securityConfig.maxDuration = 10000;
        irrigationSecteur1.moduleConfigs = toModuleConfigs([pump, valve1]);

        const irrigationSecteur2 = new SequenceModel();
        irrigationSecteur2._id = '12';
        irrigationSecteur2.status = ExecutableStatus.STOPPED;
        irrigationSecteur2.securityConfig.maxDuration = 10000;
        irrigationSecteur2.moduleConfigs = toModuleConfigs([pump, valve2]);

        const irrigationSecteur3 = new SequenceModel();
        irrigationSecteur3._id = '13';
        irrigationSecteur3.status = ExecutableStatus.STOPPED;
        irrigationSecteur3.securityConfig.maxDuration = 10000;
        irrigationSecteur3.moduleConfigs = toModuleConfigs([pump, valve3]);

        const irrigationSecteur4 = new SequenceModel();
        irrigationSecteur4._id = '14';
        irrigationSecteur4.status = ExecutableStatus.STOPPED;
        irrigationSecteur4.securityConfig.maxDuration = 10000;
        irrigationSecteur4.moduleConfigs = toModuleConfigs([pump, valve4]);

        const cycle = new CycleModel();
        cycle._id = '1';
        cycle.status = ExecutableStatus.STOPPED;
        cycle.sequences = [irrigationSecteur1, irrigationSecteur2, irrigationSecteur3, irrigationSecteur4];

        const modules = cycle.getModules(registry);
        expect(modules).toBeDefined();
        expect(modules).toHaveLength(5);
    });

    it('Should create a new cycle Model & and check if module exists in this cycle', async () => {

        const pump = await createActuator('pump', 16, GPIODirection.OUT);
        const valve1 = await createActuator('valve1', 26, GPIODirection.OUT);
        const valve2 = await createActuator('valve2', 19, GPIODirection.OUT);
        const valve3 = await createActuator('valve3', 21, GPIODirection.OUT);
        const valve4 = await createActuator('valve4', 20, GPIODirection.OUT);
        const registry = toRegistry([pump, valve1, valve2, valve3, valve4]);

        const irrigationSecteur1 = new SequenceModel();
        irrigationSecteur1._id = '11';
        irrigationSecteur1.status = ExecutableStatus.STOPPED;
        irrigationSecteur1.securityConfig.maxDuration = 10000;
        irrigationSecteur1.moduleConfigs = toModuleConfigs([pump, valve1]);

        const irrigationSecteur2 = new SequenceModel();
        irrigationSecteur2._id = '12';
        irrigationSecteur2.status = ExecutableStatus.STOPPED;
        irrigationSecteur2.securityConfig.maxDuration = 10000;
        irrigationSecteur2.moduleConfigs = toModuleConfigs([pump, valve2]);

        const irrigationSecteur3 = new SequenceModel();
        irrigationSecteur3._id = '13';
        irrigationSecteur3.status = ExecutableStatus.STOPPED;
        irrigationSecteur3.securityConfig.maxDuration = 10000;
        irrigationSecteur3.moduleConfigs = toModuleConfigs([pump, valve3]);

        const irrigationSecteur4 = new SequenceModel();
        irrigationSecteur4._id = '14';
        irrigationSecteur4.status = ExecutableStatus.STOPPED;
        irrigationSecteur4.securityConfig.maxDuration = 10000;
        irrigationSecteur4.moduleConfigs = toModuleConfigs([pump, valve4]);

        const cycle = new CycleModel();
        cycle._id = '1';
        cycle.status = ExecutableStatus.STOPPED;
        cycle.sequences = [irrigationSecteur1, irrigationSecteur2, irrigationSecteur3, irrigationSecteur4];

        const isExists = cycle.exists(valve3, registry);
        expect(isExists).toBeTruthy();
    });

    it('Should create a new cycle Model & and reset it', async () => {

        const pump = await createActuator('pump', 16, GPIODirection.OUT);
        pump.status = ModuleStatus.ON;
        const valve1 = await createActuator('valve1', 26, GPIODirection.OUT);
        valve1.status = ModuleStatus.ON;
        const valve2 = await createActuator('valve2', 19, GPIODirection.OUT);
        const valve3 = await createActuator('valve3', 21, GPIODirection.OUT);
        const valve4 = await createActuator('valve4', 20, GPIODirection.OUT);
        const registry = toRegistry([pump, valve1, valve2, valve3, valve4]);

        const irrigationSecteur1 = new SequenceModel();
        irrigationSecteur1._id = '11';
        irrigationSecteur1.status = ExecutableStatus.IN_PROCCESS;
        irrigationSecteur1.securityConfig.maxDuration = 10000;
        irrigationSecteur1.moduleConfigs = toModuleConfigs([pump, valve1]);

        const irrigationSecteur2 = new SequenceModel();
        irrigationSecteur2._id = '12';
        irrigationSecteur2.status = ExecutableStatus.STOPPED;
        irrigationSecteur2.securityConfig.maxDuration = 10000;
        irrigationSecteur2.moduleConfigs = toModuleConfigs([pump, valve2]);

        const irrigationSecteur3 = new SequenceModel();
        irrigationSecteur3._id = '13';
        irrigationSecteur3.status = ExecutableStatus.STOPPED;
        irrigationSecteur3.securityConfig.maxDuration = 10000;
        irrigationSecteur3.moduleConfigs = toModuleConfigs([pump, valve3]);

        const irrigationSecteur4 = new SequenceModel();
        irrigationSecteur4._id = '14';
        irrigationSecteur4.status = ExecutableStatus.STOPPED;
        irrigationSecteur4.securityConfig.maxDuration = 10000;
        irrigationSecteur4.moduleConfigs = toModuleConfigs([pump, valve4]);

        const cycle = new CycleModel();
        cycle._id = '1';
        cycle.status = ExecutableStatus.IN_PROCCESS;
        cycle.sequences = [irrigationSecteur1, irrigationSecteur2, irrigationSecteur3, irrigationSecteur4];

        const modules = cycle.getModules(registry);
        await actuatorService.reset(modules);
        cycle.status = ExecutableStatus.STOPPED;

        expect(cycle.status).toEqual(ExecutableStatus.STOPPED);
        modules.forEach(module => {
            expect(module.status).toEqual(ModuleStatus.OFF);
        });
    });

    it('Should skip module ids that are absent from the actuator registry when building the execution structure', () => {
        const sequence = new SequenceModel();
        sequence._id = '11';
        sequence.status = ExecutableStatus.STOPPED;
        sequence.securityConfig.maxDuration = 10000;
        sequence.moduleConfigs = [{
            moduleId: 'missing-module',
            configTiming: { waitBeforeExec: 0, waitAfterExec: 0, waitBeforeExecOff: 0, waitAfterExecOff: 0 }
        }];

        const cycle = new CycleModel();
        cycle._id = '1';
        cycle.status = ExecutableStatus.STOPPED;
        cycle.sequences = [sequence];

        const struct = cycle.getExecutionStructure(undefined, new Map());

        expect(struct).toEqual([{ sequenceId: '11', names: [], securityConfig: { maxDuration: 10000 } }]);
    });
});
