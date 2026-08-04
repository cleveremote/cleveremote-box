import { ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { GPIODirection, GPIOEdge, ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { IActuatorModule, ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { CycleModel } from '@process/domain/models/cycle.model';
import { ActuatorModel, RpiActuatorConfigModel } from '@process/domain/models/actuator.model';
import { ScheduleModel } from '@process/domain/models/schedule.model';
import { SequenceModel, SequenceModuleRef } from '@process/domain/models/sequence.model';
import { StructureModel } from '@process/domain/models/structure.model';
import { RpiActuatorStrategy } from '@process/domain/services/actuator-strategies/rpi-actuator.strategy';

const rpiActuatorStrategy = new RpiActuatorStrategy({ warn: jest.fn() } as any);

function CreateActuatorRpiModel(): ActuatorModel & { config: RpiActuatorConfigModel } {
    const actuator = new ActuatorModel();
    actuator.type = ActuatorType.RPI;
    actuator.config = new RpiActuatorConfigModel();
    return actuator as ActuatorModel & { config: RpiActuatorConfigModel };
}

const zeroedCfg = (): SequenceModuleRef['configTiming'] => ({
    waitBeforeExec: 0,
    waitAfterExec: 0,
    waitBeforeExecOff: 0,
    waitAfterExecOff: 0
});

export interface CreatedStructure {
    structure: StructureModel;
    actuatorRegistry: Map<string, IActuatorModule>;
}

// eslint-disable-next-line max-lines-per-function
export async function CreateStructure(isFalsy: number = 0): Promise<CreatedStructure> {


    //declare modules ///////////////
    const pump = CreateActuatorRpiModel();
    pump._id = 'pump';
    pump.status = ModuleStatus.OFF;
    pump.name = '16';
    pump.config.direction = GPIODirection.OUT;
    pump.config.edge = GPIOEdge.BOTH;
    await rpiActuatorStrategy.configure(pump);
    expect(pump.config.instance).toBeDefined();
    //mod1.config.debounceTimeout: number = undefined;
    //mod1.config.activeLow: boolean = false;
    //mod1.config.reconfigureDirection: boolean = true;

    //declare modules ///////////////
    const pump1 = CreateActuatorRpiModel();
    pump1._id = 'pump1';
    pump1.status = ModuleStatus.OFF;
    pump1.name = '2022';
    pump1.config.direction = GPIODirection.IN;
    pump1.config.edge = GPIOEdge.BOTH;
    await rpiActuatorStrategy.configure(pump1);
    expect(pump1.config.instance).toBeDefined();
    //mod1.config.debounceTimeout: number = undefined;
    //mod1.config.activeLow: boolean = false;
    //mod1.config.reconfigureDirection: boolean = true;


    const valve1 = CreateActuatorRpiModel();
    valve1._id = 'valve1';
    valve1.status = ModuleStatus.OFF;
    valve1.name = '26';
    valve1.config.direction = GPIODirection.OUT;
    valve1.config.edge = GPIOEdge.BOTH;
    //mod1.config.debounceTimeout: number = undefined;
    //mod1.config.activeLow: boolean = false;
    //mod1.config.reconfigureDirection: boolean = true;
    await rpiActuatorStrategy.configure(valve1);
    expect(valve1.config.instance).toBeDefined();

    const valve2 = CreateActuatorRpiModel();
    valve2._id = 'valve2';
    valve2.status = ModuleStatus.OFF;
    valve2.name = '19';
    valve2.config.direction = GPIODirection.OUT;
    valve2.config.edge = GPIOEdge.BOTH;
    //mod1.config.debounceTimeout: number = undefined;
    //mod1.config.activeLow: boolean = false;
    //mod1.config.reconfigureDirection: boolean = true;
    await rpiActuatorStrategy.configure(valve2);
    expect(valve2.config.instance).toBeDefined();

    const valve3 = CreateActuatorRpiModel();
    valve3._id = 'valve3';
    valve3.status = ModuleStatus.OFF;
    valve3.name = '21';
    valve3.config.direction = GPIODirection.OUT;
    valve3.config.edge = GPIOEdge.BOTH;
    //mod1.config.debounceTimeout: number = undefined;
    //mod1.config.activeLow: boolean = false;
    //mod1.config.reconfigureDirection: boolean = true;
    await rpiActuatorStrategy.configure(valve3);
    expect(valve3.config.instance).toBeDefined();

    const valve4 = CreateActuatorRpiModel();
    valve4._id = 'valve4';
    valve4.status = ModuleStatus.OFF;
    valve4.name = '20';
    valve4.config.direction = GPIODirection.OUT;
    valve4.config.edge = GPIOEdge.BOTH;
    //mod1.config.debounceTimeout: number = undefined;
    //mod1.config.activeLow: boolean = false;
    //mod1.config.reconfigureDirection: boolean = true;
    await rpiActuatorStrategy.configure(valve4);
    expect(valve4.config.instance).toBeDefined();

    const falsyModule = CreateActuatorRpiModel();
    falsyModule._id = 'falsyModule';
    falsyModule.status = ModuleStatus.OFF;
    falsyModule.name = '2022';
    falsyModule.config.direction = GPIODirection.IN;
    falsyModule.config.edge = GPIOEdge.BOTH;
    //mod1.config.debounceTimeout: number = undefined;
    //mod1.config.activeLow: boolean = false;
    //mod1.config.reconfigureDirection: boolean = true;
    await rpiActuatorStrategy.configure(falsyModule);
    expect(falsyModule.config.instance).toBeDefined();

    const actuatorRegistry = new Map<string, IActuatorModule>(
        [pump, pump1, valve1, valve2, valve3, valve4, falsyModule].map((actuator) => [actuator._id, actuator])
    );

    /////////////////////////////////

    const irrigationSecteur1 = new SequenceModel();
    irrigationSecteur1._id = '11';
    irrigationSecteur1.status = ExecutableStatus.STOPPED;
    irrigationSecteur1.securityConfig.maxDuration = 10; //3 secondes
    irrigationSecteur1.moduleConfigs = [pump, valve1].map((actuator) => ({ moduleId: actuator._id, configTiming: zeroedCfg() }));

    const irrigationSecteur2 = new SequenceModel();
    irrigationSecteur2._id = '12';
    irrigationSecteur2.status = ExecutableStatus.STOPPED;
    irrigationSecteur2.securityConfig.maxDuration = 10; //3 secondes
    irrigationSecteur2.moduleConfigs = [pump, valve2].map((actuator) => ({ moduleId: actuator._id, configTiming: zeroedCfg() }));

    const irrigationSecteur3 = new SequenceModel();
    irrigationSecteur3._id = '13';
    irrigationSecteur3.status = ExecutableStatus.STOPPED;
    irrigationSecteur3.securityConfig.maxDuration = 10; //3 secondes
    irrigationSecteur3.moduleConfigs = [pump, valve3].map((actuator) => ({ moduleId: actuator._id, configTiming: zeroedCfg() }));

    const irrigationSecteur4 = new SequenceModel();
    irrigationSecteur4._id = '13';
    irrigationSecteur4.status = ExecutableStatus.STOPPED;
    irrigationSecteur4.securityConfig.maxDuration = 10; //3 secondes
    irrigationSecteur4.moduleConfigs = [pump, valve4].map((actuator) => ({ moduleId: actuator._id, configTiming: zeroedCfg() }));

    const irrigationSecteur5 = new SequenceModel();
    irrigationSecteur5._id = '13';
    irrigationSecteur5.status = ExecutableStatus.STOPPED;
    irrigationSecteur5.securityConfig.maxDuration = 10; //3 secondes
    irrigationSecteur5.moduleConfigs = [pump1].map((actuator) => ({ moduleId: actuator._id, configTiming: zeroedCfg() }));

    const falsySequence = new SequenceModel();
    falsySequence._id = null;
    falsySequence.status = null;
    falsySequence.securityConfig.maxDuration = 10; //3 secondes
    falsySequence.moduleConfigs = [pump, falsyModule].map((actuator) => ({ moduleId: actuator._id, configTiming: zeroedCfg() }));

    const schedule = new ScheduleModel();
    schedule._id = '1';
    schedule.cycleId = '1';
    schedule.name = 'schedule';
    schedule.description = 'schedule';
    schedule.cron = { pattern: '2 * * * * *' };

    const cycle = new CycleModel();
    cycle._id = '1';
    cycle.status = ExecutableStatus.STOPPED;
    cycle.sequences = [irrigationSecteur1, irrigationSecteur2];
    //cycle.schedules = [schedule];

    const cycle2 = new CycleModel();
    cycle2._id = '2';
    cycle2.status = ExecutableStatus.STOPPED;
    cycle2.sequences = [irrigationSecteur3, irrigationSecteur4];

    const cycle3 = new CycleModel();
    cycle3._id = 'falsyxxxxx';
    cycle3.status = ExecutableStatus.STOPPED;
    cycle3.sequences = [irrigationSecteur1, irrigationSecteur5, irrigationSecteur5];

    const cycle4 = new CycleModel();
    cycle4._id = 'with_falsy_sequence';
    cycle4.status = ExecutableStatus.STOPPED;
    cycle4.sequences = [falsySequence];

    const falsyInit = new CycleModel();
    falsyInit._id = null;
    falsyInit.status = ExecutableStatus.STOPPED;
    falsyInit.sequences = [null];

    const structure = new StructureModel();
    if (isFalsy === 1) {
        structure.cycles = [cycle, cycle2, cycle3, null];
    } else if (isFalsy === 2) {
        structure.cycles = [falsyInit];
    } else {
        structure.cycles = [cycle, cycle2, cycle3, cycle4];
    }


    return { structure, actuatorRegistry };
}
