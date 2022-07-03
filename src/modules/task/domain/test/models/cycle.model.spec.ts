import { ExecutableStatus } from '@order/domain/interfaces/executable.interface';
import { GPIODirection, GPIOEdge, ModuleStatus } from '@order/domain/interfaces/structure.interface';
import { ModuleModel } from '@order/domain/models/module.model';
import { SequenceModel } from '@order/domain/models/sequence.model';
import { CycleModel } from '@order/domain/models/cycle.model';

describe('CyleModel model', () => {
    it('Should create a new cycle Model & check its struct validity', () => {

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

        const irrigation_secteur1 = new SequenceModel();
        irrigation_secteur1.id = '11';
        irrigation_secteur1.status = ExecutableStatus.STOPPED;
        irrigation_secteur1.duration = 3000; //3 secondes
        irrigation_secteur1.modules = [pump, valve1];

        const irrigation_secteur2 = new SequenceModel();
        irrigation_secteur2.id = '12';
        irrigation_secteur2.status = ExecutableStatus.STOPPED;
        irrigation_secteur2.duration = 10000; //3 secondes
        irrigation_secteur2.modules = [pump, valve2];

        const irrigation_secteur3 = new SequenceModel();
        irrigation_secteur3.id = '13';
        irrigation_secteur3.status = ExecutableStatus.STOPPED;
        irrigation_secteur3.duration = 10000; //3 secondes
        irrigation_secteur3.modules = [pump, valve3];

        const irrigation_secteur4 = new SequenceModel();
        irrigation_secteur4.id = '13';
        irrigation_secteur4.status = ExecutableStatus.STOPPED;
        irrigation_secteur4.duration = 10000; //3 secondes
        irrigation_secteur4.modules = [pump, valve4];

        const cycle = new CycleModel();
        cycle.id = '1';
        cycle.status = ExecutableStatus.STOPPED;
        cycle.sequences = [irrigation_secteur1, irrigation_secteur2, irrigation_secteur3, irrigation_secteur4];

        expect(cycle).toBeDefined();
        expect(cycle.sequences).toBeDefined();
        cycle.sequences.forEach(sequence => {
            expect(sequence).toBeDefined();
            expect(sequence.modules).toBeDefined();
            sequence.modules.forEach(module => {
                expect(module).toBeDefined();
                expect(module.instance).toBeDefined();
            });
        });
        // cycle.getModules().forEach(module => {
        //     module.instance.unexport();
        // });

    });

    it('Should create a new cycle Model & and exectStruct', () => {

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

        const irrigation_secteur1 = new SequenceModel();
        irrigation_secteur1.id = '11';
        irrigation_secteur1.status = ExecutableStatus.STOPPED;
        irrigation_secteur1.duration = 10000; //3 secondes
        irrigation_secteur1.modules = [pump, valve1];

        const irrigation_secteur2 = new SequenceModel();
        irrigation_secteur2.id = '12';
        irrigation_secteur2.status = ExecutableStatus.STOPPED;
        irrigation_secteur2.duration = 10000; //3 secondes
        irrigation_secteur2.modules = [pump, valve2];

        const irrigation_secteur3 = new SequenceModel();
        irrigation_secteur3.id = '13';
        irrigation_secteur3.status = ExecutableStatus.STOPPED;
        irrigation_secteur3.duration = 10000; //3 secondes
        irrigation_secteur3.modules = [pump, valve3];

        const irrigation_secteur4 = new SequenceModel();
        irrigation_secteur4.id = '14';
        irrigation_secteur4.status = ExecutableStatus.STOPPED;
        irrigation_secteur4.duration = 10000; //3 secondes
        irrigation_secteur4.modules = [pump, valve4];

        const cycle = new CycleModel();
        cycle.id = '1';
        cycle.status = ExecutableStatus.STOPPED;
        cycle.sequences = [irrigation_secteur1, irrigation_secteur2, irrigation_secteur3, irrigation_secteur4];

        const struct = cycle.getExecutionStructure();
        const desiredStruct = [
            { portNums: [16, 26], duration: 10000 },
            { portNums: [16, 19], duration: 10000 },
            { portNums: [16, 21], duration: 10000 },
            { portNums: [16, 20], duration: 10000 },
        ];

        expect(struct).toMatchObject(desiredStruct);

        // cycle.getModules().forEach(module => {
        //     module.instance.unexport();
        // });
    });

    it('Should create a new cycle Model & and get modules', () => {

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

        const irrigation_secteur1 = new SequenceModel();
        irrigation_secteur1.id = '11';
        irrigation_secteur1.status = ExecutableStatus.STOPPED;
        irrigation_secteur1.duration = 10000; //3 secondes
        irrigation_secteur1.modules = [pump, valve1];

        const irrigation_secteur2 = new SequenceModel();
        irrigation_secteur2.id = '12';
        irrigation_secteur2.status = ExecutableStatus.STOPPED;
        irrigation_secteur2.duration = 10000; //3 secondes
        irrigation_secteur2.modules = [pump, valve2];

        const irrigation_secteur3 = new SequenceModel();
        irrigation_secteur3.id = '13';
        irrigation_secteur3.status = ExecutableStatus.STOPPED;
        irrigation_secteur3.duration = 10000; //3 secondes
        irrigation_secteur3.modules = [pump, valve3];

        const irrigation_secteur4 = new SequenceModel();
        irrigation_secteur4.id = '14';
        irrigation_secteur4.status = ExecutableStatus.STOPPED;
        irrigation_secteur4.duration = 10000; //3 secondes
        irrigation_secteur4.modules = [pump, valve4];

        const cycle = new CycleModel();
        cycle.id = '1';
        cycle.status = ExecutableStatus.STOPPED;
        cycle.sequences = [irrigation_secteur1, irrigation_secteur2, irrigation_secteur3, irrigation_secteur4];

        const modules = cycle.getModules();
        expect(modules).toBeDefined();
        expect(modules).toHaveLength(5);

        // cycle.getModules().forEach(module => {
        //     module.instance.unexport();
        // });
    });

    it('Should create a new cycle Model & and check if module exists in this cycle', () => {

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

        const irrigation_secteur1 = new SequenceModel();
        irrigation_secteur1.id = '11';
        irrigation_secteur1.status = ExecutableStatus.STOPPED;
        irrigation_secteur1.duration = 10000; //3 secondes
        irrigation_secteur1.modules = [pump, valve1];

        const irrigation_secteur2 = new SequenceModel();
        irrigation_secteur2.id = '12';
        irrigation_secteur2.status = ExecutableStatus.STOPPED;
        irrigation_secteur2.duration = 10000; //3 secondes
        irrigation_secteur2.modules = [pump, valve2];

        const irrigation_secteur3 = new SequenceModel();
        irrigation_secteur3.id = '13';
        irrigation_secteur3.status = ExecutableStatus.STOPPED;
        irrigation_secteur3.duration = 10000; //3 secondes
        irrigation_secteur3.modules = [pump, valve3];

        const irrigation_secteur4 = new SequenceModel();
        irrigation_secteur4.id = '14';
        irrigation_secteur4.status = ExecutableStatus.STOPPED;
        irrigation_secteur4.duration = 10000; //3 secondes
        irrigation_secteur4.modules = [pump, valve4];

        const cycle = new CycleModel();
        cycle.id = '1';
        cycle.status = ExecutableStatus.STOPPED;
        cycle.sequences = [irrigation_secteur1, irrigation_secteur2, irrigation_secteur3, irrigation_secteur4];

        const exists = cycle.exists(valve3);
        expect(exists).toBeTruthy();

        // cycle.getModules().forEach(module => {
        //     module.instance.unexport();
        // });
    });

    it('Should create a new cycle Model & and reset it', async () => {

        //declare modules ///////////////
        const pump = new ModuleModel();
        pump.status = ModuleStatus.ON;
        pump.portNum = 16;
        pump.direction = GPIODirection.OUT;
        pump.edge = GPIOEdge.BOTH;
        pump.configure();
        expect(pump.instance).toBeDefined();
        //mod1.debounceTimeout: number = undefined;
        //mod1.activeLow: boolean = false;
        //mod1.reconfigureDirection: boolean = true;

        const valve1 = new ModuleModel();
        valve1.status = ModuleStatus.ON;
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

        const irrigation_secteur1 = new SequenceModel();
        irrigation_secteur1.id = '11';
        irrigation_secteur1.status = ExecutableStatus.IN_PROCCESS;
        irrigation_secteur1.duration = 10000; //3 secondes
        irrigation_secteur1.modules = [pump, valve1];

        const irrigation_secteur2 = new SequenceModel();
        irrigation_secteur2.id = '12';
        irrigation_secteur2.status = ExecutableStatus.STOPPED;
        irrigation_secteur2.duration = 10000; //3 secondes
        irrigation_secteur2.modules = [pump, valve2];

        const irrigation_secteur3 = new SequenceModel();
        irrigation_secteur3.id = '13';
        irrigation_secteur3.status = ExecutableStatus.STOPPED;
        irrigation_secteur3.duration = 10000; //3 secondes
        irrigation_secteur3.modules = [pump, valve3];

        const irrigation_secteur4 = new SequenceModel();
        irrigation_secteur4.id = '14';
        irrigation_secteur4.status = ExecutableStatus.STOPPED;
        irrigation_secteur4.duration = 10000; //3 secondes
        irrigation_secteur4.modules = [pump, valve4];

        const cycle = new CycleModel();
        cycle.id = '1';
        cycle.status = ExecutableStatus.IN_PROCCESS;
        cycle.sequences = [irrigation_secteur1, irrigation_secteur2, irrigation_secteur3, irrigation_secteur4];

        await cycle.reset();

        expect(cycle.status).toEqual(ExecutableStatus.STOPPED);
        cycle.sequences.forEach(sequence => {
            expect(sequence.status).toEqual(ExecutableStatus.STOPPED);
            sequence.modules.forEach(module => {
                expect(module.status).toEqual(ModuleStatus.OFF);
            });
        });

        // cycle.getModules().forEach(module => {
        //     module.instance.unexport();
        // });
    });


});