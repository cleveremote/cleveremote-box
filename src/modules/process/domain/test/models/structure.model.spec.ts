import { ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { GPIODirection, GPIOEdge, ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { CycleModel } from '@process/domain/models/cycle.model';
import { ModuleModel } from '@process/domain/models/module.model';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { StructureModel } from '@process/domain/models/structure.model';

describe('StructureModel model', () => {
    it('Should create a new structure Model', () => {
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

        const cycle = new CycleModel();
        cycle.id = '1';
        cycle.status = ExecutableStatus.STOPPED;
        cycle.sequences = [irrigationSecteur1, irrigationSecteur2];

        const cycle2 = new CycleModel();
        cycle2.id = '2';
        cycle2.status = ExecutableStatus.STOPPED;
        cycle2.sequences = [irrigationSecteur3, irrigationSecteur4];

        const structure = new StructureModel();
        structure.cycles = [cycle, cycle2];

        const modules = structure.getModules();
        expect(modules).toBeDefined();
        expect(modules).toHaveLength(5);

    });
});
