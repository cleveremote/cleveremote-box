import { ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { GPIODirection, GPIOEdge, ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { ModuleModel } from '@process/domain/models/module.model';
import { SequenceModel } from '@process/domain/models/sequence.model';

describe('SequenceModel model', () => {
    it('Should create a new sequence Model', () => {
        const pump = new ModuleModel();
        pump.status = ModuleStatus.OFF;
        pump.portNum = 16;
        pump.direction = GPIODirection.OUT;
        pump.edge = GPIOEdge.BOTH;
        pump.configure();
        expect(pump.instance).toBeDefined();

        const valve1 = new ModuleModel();
        valve1.status = ModuleStatus.OFF;
        valve1.portNum = 26;
        valve1.direction = GPIODirection.OUT;
        valve1.edge = GPIOEdge.BOTH;
        valve1.configure();
        expect(valve1.instance).toBeDefined();

        const irrigationSecteur1 = new SequenceModel();
        irrigationSecteur1.id = '11';
        irrigationSecteur1.status = ExecutableStatus.STOPPED;
        irrigationSecteur1.duration = 3000; //3 secondes
        irrigationSecteur1.modules = [pump, valve1];

        expect(irrigationSecteur1).toBeDefined();
        expect(irrigationSecteur1.modules).toBeDefined();
        irrigationSecteur1.modules.forEach(module => {
            expect(module).toBeDefined();
            expect(module.instance).toBeDefined();
        });
    });

    it('Should create a new sequence Model & Get modules', () => {
        const pump = new ModuleModel();
        pump.status = ModuleStatus.OFF;
        pump.portNum = 16;
        pump.direction = GPIODirection.OUT;
        pump.edge = GPIOEdge.BOTH;
        pump.configure();
        expect(pump.instance).toBeDefined();

        const valve1 = new ModuleModel();
        valve1.status = ModuleStatus.OFF;
        valve1.portNum = 26;
        valve1.direction = GPIODirection.OUT;
        valve1.edge = GPIOEdge.BOTH;
        valve1.configure();
        expect(valve1.instance).toBeDefined();

        const irrigationSecteur1 = new SequenceModel();
        irrigationSecteur1.id = '11';
        irrigationSecteur1.status = ExecutableStatus.STOPPED;
        irrigationSecteur1.duration = 3000; //3 secondes
        irrigationSecteur1.modules = [pump, valve1];

        const modules = irrigationSecteur1.getModules();

        expect(modules).toBeDefined();
        expect(modules).toHaveLength(2);
    });

    it('Should create a new sequence Model & Get structure', () => {
        const pump = new ModuleModel();
        pump.status = ModuleStatus.OFF;
        pump.portNum = 16;
        pump.direction = GPIODirection.OUT;
        pump.edge = GPIOEdge.BOTH;
        pump.configure();
        expect(pump.instance).toBeDefined();

        const valve1 = new ModuleModel();
        valve1.status = ModuleStatus.OFF;
        valve1.portNum = 26;
        valve1.direction = GPIODirection.OUT;
        valve1.edge = GPIOEdge.BOTH;
        valve1.configure();
        expect(valve1.instance).toBeDefined();

        const irrigationSecteur1 = new SequenceModel();
        irrigationSecteur1.id = '11';
        irrigationSecteur1.status = ExecutableStatus.STOPPED;
        irrigationSecteur1.duration = 3000; //3 secondes
        irrigationSecteur1.modules = [pump, valve1];

        const struct = irrigationSecteur1.getExecutionStructure();
        const desiredStruct = [
            { portNums: [16, 26], duration: 3000 }
        ];

        expect(struct).toMatchObject(desiredStruct);
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

        const valve1 = new ModuleModel();
        valve1.status = ModuleStatus.OFF;
        valve1.portNum = 26;
        valve1.direction = GPIODirection.OUT;
        valve1.edge = GPIOEdge.BOTH;
        valve1.configure();
        expect(valve1.instance).toBeDefined();

        const irrigationSecteur1 = new SequenceModel();
        irrigationSecteur1.id = '11';
        irrigationSecteur1.status = ExecutableStatus.STOPPED;
        irrigationSecteur1.duration = 3000; //3 secondes
        irrigationSecteur1.modules = [pump, valve1];

        const isExists = irrigationSecteur1.exists(valve1);
        expect(isExists).toBeTruthy();
    });

    it('Should create a new sequence Model & reset it', async () => {
        const pump = new ModuleModel();
        pump.status = ModuleStatus.ON;
        pump.portNum = 16;
        pump.direction = GPIODirection.OUT;
        pump.edge = GPIOEdge.BOTH;
        pump.configure();
        expect(pump.instance).toBeDefined();

        const valve1 = new ModuleModel();
        valve1.status = ModuleStatus.ON;
        valve1.portNum = 26;
        valve1.direction = GPIODirection.OUT;
        valve1.edge = GPIOEdge.BOTH;
        valve1.configure();
        expect(valve1.instance).toBeDefined();

        const irrigationSecteur1 = new SequenceModel();
        irrigationSecteur1.id = '11';
        irrigationSecteur1.status = ExecutableStatus.STOPPED;
        irrigationSecteur1.duration = 3000; //3 secondes
        irrigationSecteur1.modules = [pump, valve1];

        await irrigationSecteur1.reset();

        expect(irrigationSecteur1.status).toEqual(ExecutableStatus.STOPPED);

        expect(irrigationSecteur1.status).toEqual(ExecutableStatus.STOPPED);
        irrigationSecteur1.modules.forEach(module => {
            expect(module.status).toEqual(ModuleStatus.OFF);
        });
    });
});
