import { ExecutableStatus } from '@order/domain/interfaces/executable.interface';
import { GPIODirection, GPIOEdge, ModuleStatus } from '@order/domain/interfaces/structure.interface';
import { ModuleModel } from '@order/domain/models/module.model';
import { SequenceModel } from '@order/domain/models/sequence.model';

describe('SequenceModel model', () => {
    it('Should create a new sequence Model', () => {
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

        const irrigation_secteur1 = new SequenceModel();
        irrigation_secteur1.id = '11';
        irrigation_secteur1.status = ExecutableStatus.STOPPED;
        irrigation_secteur1.duration = 3000; //3 secondes
        irrigation_secteur1.modules = [pump, valve1];

        expect(irrigation_secteur1).toBeDefined();
        expect(irrigation_secteur1.modules).toBeDefined();
        irrigation_secteur1.modules.forEach(module => {
            expect(module).toBeDefined();
            expect(module.instance).toBeDefined();
        });
        // irrigation_secteur1.getModules().forEach(module => {
        //     module.instance.unexport();
        // });
    });

    it('Should create a new sequence Model & Get modules', () => {
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

        const irrigation_secteur1 = new SequenceModel();
        irrigation_secteur1.id = '11';
        irrigation_secteur1.status = ExecutableStatus.STOPPED;
        irrigation_secteur1.duration = 3000; //3 secondes
        irrigation_secteur1.modules = [pump, valve1];

        const modules = irrigation_secteur1.getModules();

        expect(modules).toBeDefined();
        expect(modules).toHaveLength(2);

        // irrigation_secteur1.getModules().forEach(module => {
        //     module.instance.unexport();
        // });
    });

    it('Should create a new sequence Model & Get structure', () => {
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

        const irrigation_secteur1 = new SequenceModel();
        irrigation_secteur1.id = '11';
        irrigation_secteur1.status = ExecutableStatus.STOPPED;
        irrigation_secteur1.duration = 3000; //3 secondes
        irrigation_secteur1.modules = [pump, valve1];

        const struct = irrigation_secteur1.getExecutionStructure();
        const desiredStruct = [
            { portNums: [16, 26], duration: 3000 }
        ];

        expect(struct).toMatchObject(desiredStruct);

        // irrigation_secteur1.getModules().forEach(module => {
        //     module.instance.unexport();
        // });
    });

    it('Should create a new sequence Model & check if module exists', () => {
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

        const irrigation_secteur1 = new SequenceModel();
        irrigation_secteur1.id = '11';
        irrigation_secteur1.status = ExecutableStatus.STOPPED;
        irrigation_secteur1.duration = 3000; //3 secondes
        irrigation_secteur1.modules = [pump, valve1];

        const exists = irrigation_secteur1.exists(valve1);
        expect(exists).toBeTruthy();

        // irrigation_secteur1.getModules().forEach(module => {
        //     module.instance.unexport();
        // });
    });

    it('Should create a new sequence Model & reset it', async () => {
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

        const irrigation_secteur1 = new SequenceModel();
        irrigation_secteur1.id = '11';
        irrigation_secteur1.status = ExecutableStatus.STOPPED;
        irrigation_secteur1.duration = 3000; //3 secondes
        irrigation_secteur1.modules = [pump, valve1];

        await irrigation_secteur1.reset();

        expect(irrigation_secteur1.status).toEqual(ExecutableStatus.STOPPED);

        expect(irrigation_secteur1.status).toEqual(ExecutableStatus.STOPPED);
        irrigation_secteur1.modules.forEach(module => {
            expect(module.status).toEqual(ModuleStatus.OFF);
        });
        
        // irrigation_secteur1.getModules().forEach(module => {
        //     module.instance.unexport();
        // });

    });

});
