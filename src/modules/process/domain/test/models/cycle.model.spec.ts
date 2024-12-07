import { ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { GPIODirection, GPIOEdge, ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { ModuleModel } from '@process/domain/models/module.model';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { CycleModel } from '@process/domain/models/cycle.model';

describe('CyleModel model', () => {
    it('Should create a new cycle Model & check its struct validity', () => {

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

        const valve2 = new ModuleModel();
        valve2.status = ModuleStatus.OFF;
        valve2.portNum = 19;
        valve2.direction = GPIODirection.OUT;
        valve2.edge = GPIOEdge.BOTH;
        valve2.configure();
        expect(valve2.instance).toBeDefined();

        const valve3 = new ModuleModel();
        valve3.status = ModuleStatus.OFF;
        valve3.portNum = 21;
        valve3.direction = GPIODirection.OUT;
        valve3.edge = GPIOEdge.BOTH;
        valve3.configure();
        expect(valve3.instance).toBeDefined();

        const valve4 = new ModuleModel();
        valve4.status = ModuleStatus.OFF;
        valve4.portNum = 20;
        valve4.direction = GPIODirection.OUT;
        valve4.edge = GPIOEdge.BOTH;
        valve4.configure();
        expect(valve4.instance).toBeDefined();

        const irrigationSecteur1 = new SequenceModel();
        irrigationSecteur1.id = '11';
        irrigationSecteur1.status = ExecutableStatus.STOPPED;
        irrigationSecteur1.maxDuration = 3000;
        irrigationSecteur1.modules = [pump, valve1];

        const irrigationSecteur2 = new SequenceModel();
        irrigationSecteur2.id = '12';
        irrigationSecteur2.status = ExecutableStatus.STOPPED;
        irrigationSecteur2.maxDuration = 10000;
        irrigationSecteur2.modules = [pump, valve2];

        const irrigationSecteur3 = new SequenceModel();
        irrigationSecteur3.id = '13';
        irrigationSecteur3.status = ExecutableStatus.STOPPED;
        irrigationSecteur3.maxDuration = 10000;
        irrigationSecteur3.modules = [pump, valve3];

        const irrigationSecteur4 = new SequenceModel();
        irrigationSecteur4.id = '13';
        irrigationSecteur4.status = ExecutableStatus.STOPPED;
        irrigationSecteur4.maxDuration = 10000;
        irrigationSecteur4.modules = [pump, valve4];

        const cycle = new CycleModel();
        cycle.id = '1';
        cycle.status = ExecutableStatus.STOPPED;
        cycle.sequences = [irrigationSecteur1, irrigationSecteur2, irrigationSecteur3, irrigationSecteur4];

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

    });

    it('Should create a new cycle Model & and exectStruct', () => {
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

        const valve2 = new ModuleModel();
        valve2.status = ModuleStatus.OFF;
        valve2.portNum = 19;
        valve2.direction = GPIODirection.OUT;
        valve2.edge = GPIOEdge.BOTH;
        valve2.configure();
        expect(valve2.instance).toBeDefined();

        const valve3 = new ModuleModel();
        valve3.status = ModuleStatus.OFF;
        valve3.portNum = 21;
        valve3.direction = GPIODirection.OUT;
        valve3.edge = GPIOEdge.BOTH;
        valve3.configure();
        expect(valve3.instance).toBeDefined();

        const valve4 = new ModuleModel();
        valve4.status = ModuleStatus.OFF;
        valve4.portNum = 20;
        valve4.direction = GPIODirection.OUT;
        valve4.edge = GPIOEdge.BOTH;
        valve4.configure();
        expect(valve4.instance).toBeDefined();

        const irrigationSecteur1 = new SequenceModel();
        irrigationSecteur1.id = '11';
        irrigationSecteur1.status = ExecutableStatus.STOPPED;
        irrigationSecteur1.maxDuration = 10000;
        irrigationSecteur1.modules = [pump, valve1];

        const irrigationSecteur2 = new SequenceModel();
        irrigationSecteur2.id = '12';
        irrigationSecteur2.status = ExecutableStatus.STOPPED;
        irrigationSecteur2.maxDuration = 10000;
        irrigationSecteur2.modules = [pump, valve2];

        const irrigationSecteur3 = new SequenceModel();
        irrigationSecteur3.id = '13';
        irrigationSecteur3.status = ExecutableStatus.STOPPED;
        irrigationSecteur3.maxDuration = 10000;
        irrigationSecteur3.modules = [pump, valve3];

        const irrigationSecteur4 = new SequenceModel();
        irrigationSecteur4.id = '14';
        irrigationSecteur4.status = ExecutableStatus.STOPPED;
        irrigationSecteur4.maxDuration = 10000;
        irrigationSecteur4.modules = [pump, valve4];

        const cycle = new CycleModel();
        cycle.id = '1';
        cycle.status = ExecutableStatus.STOPPED;
        cycle.sequences = [irrigationSecteur1, irrigationSecteur2, irrigationSecteur3, irrigationSecteur4];

        const struct = cycle.getExecutionStructure();
        const desiredStruct = [
            { sequenceId: '11', portNums: [16, 26], duration: 10000 },
            { sequenceId: '12', portNums: [16, 19], duration: 10000 },
            { sequenceId: '13', portNums: [16, 21], duration: 10000 },
            { sequenceId: '14', portNums: [16, 20], duration: 10000 }
        ];

        expect(struct).toMatchObject(desiredStruct);
    });

    it('Should create a new cycle Model & and get modules', () => {

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

        const valve2 = new ModuleModel();
        valve2.status = ModuleStatus.OFF;
        valve2.portNum = 19;
        valve2.direction = GPIODirection.OUT;
        valve2.edge = GPIOEdge.BOTH;
        valve2.configure();
        expect(valve2.instance).toBeDefined();

        const valve3 = new ModuleModel();
        valve3.status = ModuleStatus.OFF;
        valve3.portNum = 21;
        valve3.direction = GPIODirection.OUT;
        valve3.edge = GPIOEdge.BOTH;
        valve3.configure();
        expect(valve3.instance).toBeDefined();

        const valve4 = new ModuleModel();
        valve4.status = ModuleStatus.OFF;
        valve4.portNum = 20;
        valve4.direction = GPIODirection.OUT;
        valve4.edge = GPIOEdge.BOTH;
        valve4.configure();
        expect(valve4.instance).toBeDefined();

        const irrigationSecteur1 = new SequenceModel();
        irrigationSecteur1.id = '11';
        irrigationSecteur1.status = ExecutableStatus.STOPPED;
        irrigationSecteur1.maxDuration = 10000;
        irrigationSecteur1.modules = [pump, valve1];

        const irrigationSecteur2 = new SequenceModel();
        irrigationSecteur2.id = '12';
        irrigationSecteur2.status = ExecutableStatus.STOPPED;
        irrigationSecteur2.maxDuration = 10000;
        irrigationSecteur2.modules = [pump, valve2];

        const irrigationSecteur3 = new SequenceModel();
        irrigationSecteur3.id = '13';
        irrigationSecteur3.status = ExecutableStatus.STOPPED;
        irrigationSecteur3.maxDuration = 10000;
        irrigationSecteur3.modules = [pump, valve3];

        const irrigationSecteur4 = new SequenceModel();
        irrigationSecteur4.id = '14';
        irrigationSecteur4.status = ExecutableStatus.STOPPED;
        irrigationSecteur4.maxDuration = 10000;
        irrigationSecteur4.modules = [pump, valve4];

        const cycle = new CycleModel();
        cycle.id = '1';
        cycle.status = ExecutableStatus.STOPPED;
        cycle.sequences = [irrigationSecteur1, irrigationSecteur2, irrigationSecteur3, irrigationSecteur4];

        const modules = cycle.getModules();
        expect(modules).toBeDefined();
        expect(modules).toHaveLength(5);
    });

    it('Should create a new cycle Model & and check if module exists in this cycle', () => {

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

        const valve2 = new ModuleModel();
        valve2.status = ModuleStatus.OFF;
        valve2.portNum = 19;
        valve2.direction = GPIODirection.OUT;
        valve2.edge = GPIOEdge.BOTH;
        valve2.configure();
        expect(valve2.instance).toBeDefined();

        const valve3 = new ModuleModel();
        valve3.status = ModuleStatus.OFF;
        valve3.portNum = 21;
        valve3.direction = GPIODirection.OUT;
        valve3.edge = GPIOEdge.BOTH;
        valve3.configure();
        expect(valve3.instance).toBeDefined();

        const valve4 = new ModuleModel();
        valve4.status = ModuleStatus.OFF;
        valve4.portNum = 20;
        valve4.direction = GPIODirection.OUT;
        valve4.edge = GPIOEdge.BOTH;
        valve4.configure();
        expect(valve4.instance).toBeDefined();

        const irrigationSecteur1 = new SequenceModel();
        irrigationSecteur1.id = '11';
        irrigationSecteur1.status = ExecutableStatus.STOPPED;
        irrigationSecteur1.maxDuration = 10000;
        irrigationSecteur1.modules = [pump, valve1];

        const irrigationSecteur2 = new SequenceModel();
        irrigationSecteur2.id = '12';
        irrigationSecteur2.status = ExecutableStatus.STOPPED;
        irrigationSecteur2.maxDuration = 10000;
        irrigationSecteur2.modules = [pump, valve2];

        const irrigationSecteur3 = new SequenceModel();
        irrigationSecteur3.id = '13';
        irrigationSecteur3.status = ExecutableStatus.STOPPED;
        irrigationSecteur3.maxDuration = 10000;
        irrigationSecteur3.modules = [pump, valve3];

        const irrigationSecteur4 = new SequenceModel();
        irrigationSecteur4.id = '14';
        irrigationSecteur4.status = ExecutableStatus.STOPPED;
        irrigationSecteur4.maxDuration = 10000;
        irrigationSecteur4.modules = [pump, valve4];

        const cycle = new CycleModel();
        cycle.id = '1';
        cycle.status = ExecutableStatus.STOPPED;
        cycle.sequences = [irrigationSecteur1, irrigationSecteur2, irrigationSecteur3, irrigationSecteur4];

        const isExists = cycle.exists(valve3);
        expect(isExists).toBeTruthy();
    });

    it('Should create a new cycle Model & and reset it', async () => {

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

        const valve2 = new ModuleModel();
        valve2.status = ModuleStatus.OFF;
        valve2.portNum = 19;
        valve2.direction = GPIODirection.OUT;
        valve2.edge = GPIOEdge.BOTH;
        valve2.configure();
        expect(valve2.instance).toBeDefined();

        const valve3 = new ModuleModel();
        valve3.status = ModuleStatus.OFF;
        valve3.portNum = 21;
        valve3.direction = GPIODirection.OUT;
        valve3.edge = GPIOEdge.BOTH;
        valve3.configure();
        expect(valve3.instance).toBeDefined();

        const valve4 = new ModuleModel();
        valve4.status = ModuleStatus.OFF;
        valve4.portNum = 20;
        valve4.direction = GPIODirection.OUT;
        valve4.edge = GPIOEdge.BOTH;
        valve4.configure();
        expect(valve4.instance).toBeDefined();

        const irrigationSecteur1 = new SequenceModel();
        irrigationSecteur1.id = '11';
        irrigationSecteur1.status = ExecutableStatus.IN_PROCCESS;
        irrigationSecteur1.maxDuration = 10000;
        irrigationSecteur1.modules = [pump, valve1];

        const irrigationSecteur2 = new SequenceModel();
        irrigationSecteur2.id = '12';
        irrigationSecteur2.status = ExecutableStatus.STOPPED;
        irrigationSecteur2.maxDuration = 10000;
        irrigationSecteur2.modules = [pump, valve2];

        const irrigationSecteur3 = new SequenceModel();
        irrigationSecteur3.id = '13';
        irrigationSecteur3.status = ExecutableStatus.STOPPED;
        irrigationSecteur3.maxDuration = 10000;
        irrigationSecteur3.modules = [pump, valve3];

        const irrigationSecteur4 = new SequenceModel();
        irrigationSecteur4.id = '14';
        irrigationSecteur4.status = ExecutableStatus.STOPPED;
        irrigationSecteur4.maxDuration = 10000;
        irrigationSecteur4.modules = [pump, valve4];

        const cycle = new CycleModel();
        cycle.id = '1';
        cycle.status = ExecutableStatus.IN_PROCCESS;
        cycle.sequences = [irrigationSecteur1, irrigationSecteur2, irrigationSecteur3, irrigationSecteur4];

        await cycle.reset();

        expect(cycle.status).toEqual(ExecutableStatus.STOPPED);
        cycle.sequences.forEach(sequence => {
            expect(sequence.status).toEqual(ExecutableStatus.STOPPED);
            sequence.modules.forEach(module => {
                expect(module.status).toEqual(ModuleStatus.OFF);
            });
        });
    });
});