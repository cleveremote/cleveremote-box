import { ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { GPIODirection, GPIOEdge, ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { CycleModel } from '@process/domain/models/cycle.model';
import { ModuleModel } from '@process/domain/models/module.model';
import { ScheduleModel } from '@process/domain/models/schedule.model';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { StructureModel } from '@process/domain/models/structure.model';

// eslint-disable-next-line max-lines-per-function
export function CreateStructure(isFalsy: number = 0): StructureModel {


    //declare modules ///////////////
    const pump = new ModuleModel();
    pump.status = ModuleStatus.OFF;
    pump.portNum = 16;
    pump.direction = GPIODirection.OUT;
    pump.edge = GPIOEdge.BOTH;
    pump.configure();
    expect(pump.instance).toBeDefined();
    //mod1.debounceTimeout: number = undefined;
    //mod1.activeLow: boolean = false;
    //mod1.reconfigureDirection: boolean = true;

    //declare modules ///////////////
    const pump1 = new ModuleModel();
    pump1.status = ModuleStatus.OFF;
    pump1.portNum = 2022;
    pump1.direction = GPIODirection.IN;
    pump1.edge = GPIOEdge.BOTH;
    pump1.configure();
    expect(pump1.instance).toBeDefined();
    //mod1.debounceTimeout: number = undefined;
    //mod1.activeLow: boolean = false;
    //mod1.reconfigureDirection: boolean = true;


    const valve1 = new ModuleModel();
    valve1.status = ModuleStatus.OFF;
    valve1.portNum = 26;
    valve1.direction = GPIODirection.OUT;
    valve1.edge = GPIOEdge.BOTH;
    //mod1.debounceTimeout: number = undefined;
    //mod1.activeLow: boolean = false;
    //mod1.reconfigureDirection: boolean = true;
    valve1.configure();
    expect(valve1.instance).toBeDefined();

    const valve2 = new ModuleModel();
    valve2.status = ModuleStatus.OFF;
    valve2.portNum = 19;
    valve2.direction = GPIODirection.OUT;
    valve2.edge = GPIOEdge.BOTH;
    //mod1.debounceTimeout: number = undefined;
    //mod1.activeLow: boolean = false;
    //mod1.reconfigureDirection: boolean = true;
    valve2.configure();
    expect(valve2.instance).toBeDefined();

    const valve3 = new ModuleModel();
    valve3.status = ModuleStatus.OFF;
    valve3.portNum = 21;
    valve3.direction = GPIODirection.OUT;
    valve3.edge = GPIOEdge.BOTH;
    //mod1.debounceTimeout: number = undefined;
    //mod1.activeLow: boolean = false;
    //mod1.reconfigureDirection: boolean = true;
    valve3.configure();
    expect(valve3.instance).toBeDefined();

    const valve4 = new ModuleModel();
    valve4.status = ModuleStatus.OFF;
    valve4.portNum = 20;
    valve4.direction = GPIODirection.OUT;
    valve4.edge = GPIOEdge.BOTH;
    //mod1.debounceTimeout: number = undefined;
    //mod1.activeLow: boolean = false;
    //mod1.reconfigureDirection: boolean = true;
    valve4.configure();
    expect(valve4.instance).toBeDefined();

    const falsyModule = new ModuleModel();
    falsyModule.status = ModuleStatus.OFF;
    falsyModule.portNum = 2022;
    falsyModule.direction = GPIODirection.IN;
    falsyModule.edge = GPIOEdge.BOTH;
    //mod1.debounceTimeout: number = undefined;
    //mod1.activeLow: boolean = false;
    //mod1.reconfigureDirection: boolean = true;
    falsyModule.configure();
    expect(falsyModule.instance).toBeDefined();

    /////////////////////////////////

    const irrigationSecteur1 = new SequenceModel();
    irrigationSecteur1.id = '11';
    irrigationSecteur1.status = ExecutableStatus.STOPPED;
    irrigationSecteur1.maxDuration = 10; //3 secondes
    irrigationSecteur1.modules = [pump, valve1];

    const irrigationSecteur2 = new SequenceModel();
    irrigationSecteur2.id = '12';
    irrigationSecteur2.status = ExecutableStatus.STOPPED;
    irrigationSecteur2.maxDuration = 10; //3 secondes
    irrigationSecteur2.modules = [pump, valve2];

    const irrigationSecteur3 = new SequenceModel();
    irrigationSecteur3.id = '13';
    irrigationSecteur3.status = ExecutableStatus.STOPPED;
    irrigationSecteur3.maxDuration = 10; //3 secondes
    irrigationSecteur3.modules = [pump, valve3];

    const irrigationSecteur4 = new SequenceModel();
    irrigationSecteur4.id = '13';
    irrigationSecteur4.status = ExecutableStatus.STOPPED;
    irrigationSecteur4.maxDuration = 10; //3 secondes
    irrigationSecteur4.modules = [pump, valve4];

    const irrigationSecteur5 = new SequenceModel();
    irrigationSecteur5.id = '13';
    irrigationSecteur5.status = ExecutableStatus.STOPPED;
    irrigationSecteur5.maxDuration = 10; //3 secondes
    irrigationSecteur5.modules = [pump1];

    const falsySequence = new SequenceModel();
    falsySequence.id = null;
    falsySequence.status = null;
    falsySequence.maxDuration = 10; //3 secondes
    falsySequence.modules = [pump, falsyModule];

    const schedule = new ScheduleModel();
    schedule.id = '1';
    schedule.cycleId = '1';
    schedule.name = 'schedule';
    schedule.description = 'schedule';
    schedule.cron = { pattern: '2 * * * * *' };

    const cycle = new CycleModel();
    cycle.id = '1';
    cycle.status = ExecutableStatus.STOPPED;
    cycle.sequences = [irrigationSecteur1, irrigationSecteur2];
    //cycle.schedules = [schedule];

    const cycle2 = new CycleModel();
    cycle2.id = '2';
    cycle2.status = ExecutableStatus.STOPPED;
    cycle2.sequences = [irrigationSecteur3, irrigationSecteur4];

    const cycle3 = new CycleModel();
    cycle3.id = 'falsyxxxxx';
    cycle3.status = ExecutableStatus.STOPPED;
    cycle3.sequences = [irrigationSecteur1, irrigationSecteur5, irrigationSecteur5];

    const cycle4 = new CycleModel();
    cycle4.id = 'with_falsy_sequence';
    cycle4.status = ExecutableStatus.STOPPED;
    cycle4.sequences = [falsySequence];

    const falsyInit = new CycleModel();
    falsyInit.id = null;
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


    return structure;
}