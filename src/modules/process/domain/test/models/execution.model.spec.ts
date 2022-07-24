import { ConditionType, ExecutableAction, ExecutableMode, ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { GPIODirection, GPIOEdge, ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { CycleModel } from '@process/domain/models/cycle.model';
import { ProcessModel } from '@process/domain/models/process.model';
import { ModuleModel } from '@process/domain/models/module.model';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { delay, lastValueFrom } from 'rxjs';

describe('ExecutionModel model', () => {

    it('Should create a new execution Cycle as task Model and execute It action:ON', () => {
        const execution = new ProcessModel();

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
        irrigationSecteur1.duration = 1000; //3 secondes
        irrigationSecteur1.modules = [pump, valve1];

        const irrigationSecteur2 = new SequenceModel();
        irrigationSecteur2.id = '12';
        irrigationSecteur2.status = ExecutableStatus.STOPPED;
        irrigationSecteur2.duration = 1000; //3 secondes
        irrigationSecteur2.modules = [pump, valve2];

        const irrigationSecteur3 = new SequenceModel();
        irrigationSecteur3.id = '13';
        irrigationSecteur3.status = ExecutableStatus.STOPPED;
        irrigationSecteur3.duration = 1000; //3 secondes
        irrigationSecteur3.modules = [pump, valve3];

        const irrigationSecteur4 = new SequenceModel();
        irrigationSecteur4.id = '13';
        irrigationSecteur4.status = ExecutableStatus.STOPPED;
        irrigationSecteur4.duration = 1000; //3 secondes
        irrigationSecteur4.modules = [pump, valve4];

        const cycle = new CycleModel();
        cycle.id = '1';
        cycle.status = ExecutableStatus.STOPPED;
        cycle.sequences = [irrigationSecteur1, irrigationSecteur2, irrigationSecteur3, irrigationSecteur4];

        expect(execution).toBeDefined();
        execution.task = cycle;
        execution.action = ExecutableAction.ON;
        execution.type = ConditionType.NOW;
        execution.function = 'string';
        execution.mode = ExecutableMode.NORMAL;

        lastValueFrom(execution.execute()).then(async (res) => {
            expect(res).toBeTruthy();
            expect(execution.task.status).toEqual(ExecutableStatus.STOPPED);
        });
    });

    it('Should create a new execution Cycle as task Model and execute It action:OFF', () => {
        const execution = new ProcessModel();

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
        irrigationSecteur1.duration = 1000; //3 secondes
        irrigationSecteur1.modules = [pump, valve1];

        const irrigationSecteur2 = new SequenceModel();
        irrigationSecteur2.id = '12';
        irrigationSecteur2.status = ExecutableStatus.STOPPED;
        irrigationSecteur2.duration = 1000; //3 secondes
        irrigationSecteur2.modules = [pump, valve2];

        const irrigationSecteur3 = new SequenceModel();
        irrigationSecteur3.id = '13';
        irrigationSecteur3.status = ExecutableStatus.STOPPED;
        irrigationSecteur3.duration = 1000; //3 secondes
        irrigationSecteur3.modules = [pump, valve3];

        const irrigationSecteur4 = new SequenceModel();
        irrigationSecteur4.id = '13';
        irrigationSecteur4.status = ExecutableStatus.STOPPED;
        irrigationSecteur4.duration = 1000; //3 secondes
        irrigationSecteur4.modules = [pump, valve4];

        const cycle = new CycleModel();
        cycle.id = '1';
        cycle.status = ExecutableStatus.STOPPED;
        cycle.sequences = [irrigationSecteur1, irrigationSecteur2, irrigationSecteur3, irrigationSecteur4];

        expect(execution).toBeDefined();
        execution.task = cycle;
        execution.action = ExecutableAction.OFF;
        execution.type = ConditionType.NOW;
        execution.function = 'string';
        execution.mode = ExecutableMode.NORMAL;

        return lastValueFrom(execution.execute()).then(async (res) => {
            expect(res).toBeTruthy();
            expect(execution.task.status).toEqual(ExecutableStatus.STOPPED);
        });
    });

    it('Should create a new execution Cycle as task Model and execute It action:OFF', () => {
        const execution = new ProcessModel();

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
        irrigationSecteur1.duration = 1000; //3 secondes
        irrigationSecteur1.modules = [pump, valve1];

        const irrigationSecteur2 = new SequenceModel();
        irrigationSecteur2.id = '12';
        irrigationSecteur2.status = ExecutableStatus.STOPPED;
        irrigationSecteur2.duration = 1000; //3 secondes
        irrigationSecteur2.modules = [pump, valve2];

        const irrigationSecteur3 = new SequenceModel();
        irrigationSecteur3.id = '13';
        irrigationSecteur3.status = ExecutableStatus.STOPPED;
        irrigationSecteur3.duration = 1000; //3 secondes
        irrigationSecteur3.modules = [pump, valve3];

        const irrigationSecteur4 = new SequenceModel();
        irrigationSecteur4.id = '13';
        irrigationSecteur4.status = ExecutableStatus.STOPPED;
        irrigationSecteur4.duration = 1000; //3 secondes
        irrigationSecteur4.modules = [pump, valve4];

        const cycle = new CycleModel();
        cycle.id = '1';
        cycle.status = ExecutableStatus.STOPPED;
        cycle.sequences = [irrigationSecteur1, irrigationSecteur2, irrigationSecteur3, irrigationSecteur4];

        expect(execution).toBeDefined();
        execution.task = cycle;
        execution.action = ExecutableAction.ON;
        execution.type = ConditionType.NOW;
        execution.function = 'string';
        execution.mode = ExecutableMode.NORMAL;

        return lastValueFrom(execution.execute()).then(async (res) => {
            expect(res).toBeTruthy();
            expect(execution.task.status).toEqual(ExecutableStatus.STOPPED);
        });
    });

});
