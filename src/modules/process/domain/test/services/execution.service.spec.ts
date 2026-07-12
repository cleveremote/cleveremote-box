import { Connection } from 'mongoose';
import { SchedulerRegistry, ScheduleModule } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { ProcessService } from '@process/domain/services/execution.service';
import { StructureService } from '@process/domain/services/configuration.service';
import { ActuatorService } from '@process/domain/services/actuator.service';
import { CycleRepository } from '@process/infrastructure/repositories/cycle.repository';
import { CycleMongooseRepository } from '@process/infrastructure/repositories/cycle-mongoose.repository';
import { SequenceMongooseRepository } from '@process/infrastructure/repositories/sequence-mongoose.repository';
import { ScheduleMongooseRepository } from '@process/infrastructure/repositories/schedule-mongoose.repository';
import { TriggerMongooseRepository } from '@process/infrastructure/repositories/trigger-mongoose.repository';
import { Cycle, CycleSchema } from '@process/infrastructure/schemas/cycle.schema';
import { Sequence, SequenceSchema } from '@process/infrastructure/schemas/sequence.schema';
import { Schedule, ScheduleSchema } from '@process/infrastructure/schemas/schedule.schema';
import { Trigger, TriggerSchema } from '@process/infrastructure/schemas/trigger.schema';
import { CycleModel } from '@process/domain/models/cycle.model';
import { ProcessModel } from '@process/domain/models/process.model';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { ScheduleModel } from '@process/domain/models/schedule.model';
import { ConditionModel } from '@process/domain/models/condition.model';
import { TriggerModel } from '@process/domain/models/trigger.model';
import { IActuatorModule, ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { ActuatorModel, ComActuatorAction, ComActuatorConfigModel, DigitalPortType } from '@process/domain/models/actuator.model';
import { CycleType, ExecutableAction, ExecutableStatus, ProcessMode, ProcessType } from '@process/domain/interfaces/executable.interface';
import { ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { StructureInvalidError } from '@process/domain/errors/structure-invalid.error';
import { ProcessInvalidTypeError } from '@process/domain/errors/process-invalid-type-error';
import { StartMongoMemory, StopMongoMemory } from './mongo-memory.spec-mock';
import { CreateCycleModel } from './cycle.spec-mock';

function CreateFakeActuator(id: string, portNum: number, type: ActuatorType = ActuatorType.RPI): IActuatorModule {
    return { _id: id, name: String(portNum), status: ModuleStatus.OFF, type };
}

interface SequenceSpec {
    moduleIds: string[];
    maxDuration?: number;
    configTiming?: { waitBeforeExec?: number; waitAfterExec?: number; waitBeforeExecOff?: number; waitAfterExecOff?: number };
    conditions?: ConditionModel[];
}

function CreateSequence(cycleId: string, moduleIds: string[], maxDuration = 30, spec: Partial<SequenceSpec> = {}): SequenceModel {
    const sequence = new SequenceModel();
    sequence.cycleId = cycleId;
    sequence.name = `${cycleId}-seq`;
    sequence.status = ExecutableStatus.STOPPED;
    sequence.securityConfig.maxDuration = maxDuration;
    sequence.securityConfig.conditions = spec.conditions ?? [];
    sequence.moduleConfigs = moduleIds.map((moduleId) => ({
        moduleId,
        configTiming: {
            waitBeforeExec: spec.configTiming?.waitBeforeExec ?? 0,
            waitAfterExec: spec.configTiming?.waitAfterExec ?? 0,
            waitBeforeExecOff: spec.configTiming?.waitBeforeExecOff ?? 0,
            waitAfterExecOff: spec.configTiming?.waitAfterExecOff ?? 0
        }
    }));
    return sequence;
}

function CreateLoggerMock(): { log: jest.Mock; debug: jest.Mock; warn: jest.Mock; error: jest.Mock } {
    return { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function Flush(ms = 200): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ProcessService.reset() programme un setTimeout(20000) reel (grace-period avant reecriture
// modbus) qu'aucune API publique ne permet d'annuler. Sans neutralisation ce timer survit a la
// fin de ce fichier et peut se declencher pendant qu'un AUTRE fichier de test tourne dans le meme
// worker Jest (observe : corruption aleatoire d'un fichier voisin quand --runInBand/peu de
// workers force plusieurs fichiers a partager le meme process). Seuil a 15s : au-dessus des
// heartbeats Mongo habituels (~10s) donc sans impact sur mongodb-memory-server/mongoose, mais en
// dessous du leak de 20s qu'on veut neutraliser.
const REAL_SET_TIMEOUT = global.setTimeout;
const LONG_DELAY_THRESHOLD_MS = 15000;

beforeAll(() => {
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
        if ((ms ?? 0) >= LONG_DELAY_THRESHOLD_MS) {
            return { unref: () => undefined, ref: () => undefined } as unknown as NodeJS.Timeout;
        }
        return REAL_SET_TIMEOUT(fn, ms, ...args);
    }) as typeof setTimeout);
});

afterAll(() => {
    jest.restoreAllMocks();
});

// ProcessService pilote reellement les actionneurs (GPIO) et l'onduleur (Modbus) : ActuatorService et
// ModbusTaskService sont entierement mockes, jamais d'instance reelle dans ces tests (meme
// principe que actuator.service.spec.ts / ctrl-actuator.strategy.spec.ts).
describe('ProcessService (integration mongodb-memory-server for cycles, actuator/modbus mocked)', () => {
    let mongod: Awaited<ReturnType<typeof StartMongoMemory>>['mongod'];
    let connection: Connection;
    let schedulerRegistry: SchedulerRegistry;
    let cycleRepository: CycleRepository;
    let sequenceMongooseRepository: SequenceMongooseRepository;
    let scheduleMongooseRepository: ScheduleMongooseRepository;
    let triggerMongooseRepository: TriggerMongooseRepository;
    let structureService: StructureService;
    let actuatorService: { resolve: jest.Mock; execute: jest.Mock; reset: jest.Mock };
    let modBusService: { execute: jest.Mock; applyInverterConfig: jest.Mock };
    let wsService: { sendMessage: jest.Mock };
    let valueRepository: { getDeviceValue: jest.Mock };
    let eventRepository: { save: jest.Mock; getLast: jest.Mock; getByDeviceAndDateRange: jest.Mock };
    let triggerService: { setPaused: jest.Mock };
    let scheduleService: { setPaused: jest.Mock };
    let logger: ReturnType<typeof CreateLoggerMock>;
    let service: ProcessService;
    let actuatorTypeOverrides: Record<string, ActuatorType>;

    beforeAll(async () => {
        ({ mongod, connection } = await StartMongoMemory());

        const cycleModel = connection.model(Cycle.name, CycleSchema);
        const sequenceModel = connection.model(Sequence.name, SequenceSchema);
        const scheduleModel = connection.model(Schedule.name, ScheduleSchema);
        const triggerModel = connection.model(Trigger.name, TriggerSchema);

        sequenceMongooseRepository = new SequenceMongooseRepository(sequenceModel as never);
        scheduleMongooseRepository = new ScheduleMongooseRepository(scheduleModel as never);
        triggerMongooseRepository = new TriggerMongooseRepository(triggerModel as never);
        cycleRepository = new CycleRepository(
            new CycleMongooseRepository(
                cycleModel as never,
                sequenceMongooseRepository,
                scheduleMongooseRepository,
                triggerMongooseRepository
            ),
            {} as never,
            {} as never,
            {} as never
        );

        const testingModule = await Test.createTestingModule({ imports: [ScheduleModule.forRoot()] }).compile();
        schedulerRegistry = testingModule.get(SchedulerRegistry);
    }, 120000);

    afterAll(async () => {
        await StopMongoMemory(mongod, connection);
    });

    beforeEach(async () => {
        await connection.collection('cycles').deleteMany({});
        await connection.collection('sequences').deleteMany({});
        await connection.collection('schedules').deleteMany({});
        await connection.collection('triggers').deleteMany({});

        const emptyGetRepo = { get: jest.fn().mockResolvedValue([]) };
        const structureEventRepository = {
            save: jest.fn().mockResolvedValue(undefined),
            getLast: jest.fn().mockResolvedValue(null),
            getByDeviceAndDateRange: jest.fn().mockResolvedValue([])
        };
        structureService = new StructureService(
            cycleRepository,
            emptyGetRepo as never,
            emptyGetRepo as never,
            emptyGetRepo as never,
            structureEventRepository as never,
            emptyGetRepo as never
        );

        actuatorService = {
            resolve: jest.fn((moduleIds: string[]) => Promise.resolve(new Map(moduleIds.map((id, i) => [id, CreateFakeActuator(id, 100 + i)])))),
            execute: jest.fn().mockResolvedValue(undefined),
            reset: jest.fn().mockResolvedValue(undefined)
        };
        // permet a certains tests de forcer le type (COM/RPI/CTRL) d'un actuator donne, sans
        // perdre le comportement par defaut (RPI) pour tous les autres.
        actuatorTypeOverrides = {};
        actuatorService.resolve.mockImplementation((moduleIds: string[]) =>
            Promise.resolve(new Map(moduleIds.map((id, i) => [id, CreateFakeActuator(id, 100 + i, actuatorTypeOverrides[id])])))
        );
        modBusService = { execute: jest.fn().mockResolvedValue(undefined), applyInverterConfig: jest.fn().mockResolvedValue(undefined) };
        wsService = { sendMessage: jest.fn().mockResolvedValue('ok') };
        valueRepository = {
            getDeviceValue: jest.fn().mockResolvedValue(0)
        };
        eventRepository = {
            save: jest.fn().mockResolvedValue(undefined),
            getLast: jest.fn().mockResolvedValue(null),
            getByDeviceAndDateRange: jest.fn().mockResolvedValue([])
        };
        triggerService = { setPaused: jest.fn().mockImplementation((trigger) => Promise.resolve(trigger)) };
        scheduleService = { setPaused: jest.fn().mockImplementation((schedule) => Promise.resolve(schedule)) };
        logger = CreateLoggerMock();

        service = new ProcessService(
            schedulerRegistry,
            structureService,
            wsService as never,
            cycleRepository,
            valueRepository as never,
            eventRepository as never,
            modBusService as never,
            actuatorService as unknown as ActuatorService,
            triggerService as never,
            scheduleService as never,
            logger as never
        );
    });

    interface CycleSpec {
        name: string;
        // une entree par sequence a creer pour ce cycle (dans l'ordre d'execution)
        sequences: Partial<SequenceSpec>[];
        modePriority?: { mode: ProcessMode; priority: number }[];
        type?: CycleType;
    }

    // seede tous les cycles/sequences demandes (persistes reellement en Mongo, y compris les
    // sequences - necessaire pour que resetAllModules()/testAllModules() les voient aussi, ces
    // methodes relisant les cycles frais depuis cycleRepository.get() plutot que depuis
    // structureService.structure) puis charge la structure UNE seule fois : appeler getStructure()
    // plusieurs fois reconstruit systematiquement de nouveaux objets CycleModel, ce qui
    // invaliderait les references deja capturees par un appel precedent.
    async function SeedCycles(specs: CycleSpec[]): Promise<CycleModel[]> {
        const savedIds: string[] = [];
        for (const spec of specs) {
            const saved = await cycleRepository.save(CreateCycleModel({
                name: spec.name,
                ...(spec.modePriority ? { modePriority: spec.modePriority } : {}),
                ...(spec.type ? { type: spec.type } : {})
            }));
            savedIds.push(saved._id);
            for (const sequenceSpec of spec.sequences) {
                await sequenceMongooseRepository.create(
                    CreateSequence(saved._id, sequenceSpec.moduleIds, sequenceSpec.maxDuration ?? 30, sequenceSpec)
                );
            }
        }
        await structureService.getStructure();
        return savedIds.map((id) => structureService.structure.cycles.find((c) => c._id === id));
    }

    // raccourci pour le cas courant : un seul cycle avec une seule sequence
    async function SeedCycle(name: string, moduleIds: string[], maxDuration = 30): Promise<CycleModel> {
        const [cycle] = await SeedCycles([{ name, sequences: [{ moduleIds, maxDuration }] }]);
        return cycle;
    }

    function CreateProcess(cycle: CycleModel, mode: ProcessMode, action: ExecutableAction, type = ProcessType.FORCE): ProcessModel {
        const process = new ProcessModel();
        process.cycle = cycle;
        process.mode = mode;
        process.action = action;
        process.type = type;
        return process;
    }

    describe('execute', () => {
        it('should turn a cycle ON then automatically back to STOPPED once its sequence completes', async () => {
            const cycle = await SeedCycle('cycle-1', ['module-a']);
            const process = CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.ON);

            await service.execute(process);
            expect(cycle.status).toEqual(ExecutableStatus.IN_PROCCESS);

            await Flush();
            expect(cycle.status).toEqual(ExecutableStatus.STOPPED);
        });

        it('should turn a running cycle OFF immediately on action=OFF', async () => {
            const cycle = await SeedCycle('cycle-1', ['module-a']);
            await service.execute(CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.ON));
            expect(cycle.status).toEqual(ExecutableStatus.IN_PROCCESS);

            await service.execute(CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.OFF));

            expect(cycle.status).toEqual(ExecutableStatus.STOPPED);
        });

        it('should throw StructureInvalidError when the cycle does not exist in the structure', async () => {
            await SeedCycles([]);
            const ghostCycle = new CycleModel();
            ghostCycle._id = 'missing-cycle';
            const process = CreateProcess(ghostCycle, ProcessMode.MANUAL, ExecutableAction.ON);

            await expect(service.execute(process)).rejects.toBeInstanceOf(StructureInvalidError);
        });

        it('should stop a conflicting cycle sharing a actuator module before starting the new one', async () => {
            const [cycleA, cycleB] = await SeedCycles([
                { name: 'cycle-a', sequences: [{ moduleIds: ['shared-pump'] }] },
                { name: 'cycle-b', sequences: [{ moduleIds: ['shared-pump'] }] }
            ]);

            await service.execute(CreateProcess(cycleA, ProcessMode.MANUAL, ExecutableAction.ON));
            expect(cycleA.status).toEqual(ExecutableStatus.IN_PROCCESS);

            await service.execute(CreateProcess(cycleB, ProcessMode.MANUAL, ExecutableAction.ON));

            expect(cycleA.status).toEqual(ExecutableStatus.STOPPED);
            expect(cycleB.status).toEqual(ExecutableStatus.IN_PROCCESS);

            await Flush();
            expect(cycleB.status).toEqual(ExecutableStatus.STOPPED);
        });

        it('should throw "Method not implemented" for ProcessType.QUEUED', async () => {
            const cycle = await SeedCycle('cycle-1', ['module-a']);
            const process = CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.ON, ProcessType.QUEUED);

            await expect(service.execute(process)).rejects.toThrow('Method not implemented.');
        });

        it('should be a no-op for ProcessType.CONFIRMATION', async () => {
            const cycle = await SeedCycle('cycle-1', ['module-a']);
            const process = CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.ON, ProcessType.CONFIRMATION);

            await service.execute(process);

            expect(actuatorService.execute).not.toHaveBeenCalled();
        });

        it('should remove and report a STOPPED status for ProcessType.IGNORE', async () => {
            const cycle = await SeedCycle('cycle-1', ['module-a']);
            const process = CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.ON, ProcessType.IGNORE);

            await service.execute(process);

            expect(eventRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    elementId: cycle._id,
                    additionalData: expect.objectContaining({ status: ExecutableStatus.STOPPED })
                })
            );
        });

        it('should remove the process from the tracked list when it was already running', async () => {
            const cycle = await SeedCycle('cycle-1', ['module-a'], 5000);
            await service.execute(CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.ON));
            expect(service.processList).toHaveLength(1);

            await service.execute(CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.ON, ProcessType.IGNORE));

            expect(service.processList).toHaveLength(0);
        });

        it('should auto-force execution (INIT -> FORCE) when nothing else is running', async () => {
            // _manageProcessMode() ne "await" pas son propre appel interne a _manageProcessType() :
            // execute() peut donc resoudre avant que le statut IN_PROCCESS ne soit pose.
            const cycle = await SeedCycle('cycle-1', ['module-a'], 150);
            const process = CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.ON, ProcessType.INIT);

            await service.execute(process);
            await Flush(50);

            expect(cycle.status).toEqual(ExecutableStatus.IN_PROCCESS);

            // laisse la sequence se terminer naturellement plutot que de laisser sa chaine
            // d'execution (et son setTimeout interne) en vol au-dela de ce test.
            await Flush(200);
        });

        it('should resolve the queued flag for a sequence when using ProcessType.SKIP', async () => {
            const cycle = await SeedCycle('cycle-1', ['module-a'], 5000);
            await service.execute(CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.ON));
            const sequenceId = cycle.sequences[0]._id;
            const skipCycle = new CycleModel();
            skipCycle._id = sequenceId;

            await expect(service.execute(CreateProcess(skipCycle, ProcessMode.MANUAL, ExecutableAction.ON, ProcessType.SKIP)))
                .resolves.toBeUndefined();

            await Flush(150);
        });

        it('should throw ProcessInvalidTypeError for an unrecognized process type', async () => {
            const cycle = await SeedCycle('cycle-1', ['module-a']);
            const process = CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.ON, 'UNKNOWN' as ProcessType);

            await expect(service.execute(process)).rejects.toBeInstanceOf(ProcessInvalidTypeError);
        });

        it('should require confirmation when a conflicting process has equal priority', async () => {
            const [cycleA, cycleB] = await SeedCycles([
                { name: 'cycle-a', sequences: [{ moduleIds: ['shared-pump'] }] },
                { name: 'cycle-b', sequences: [{ moduleIds: ['shared-pump'] }] }
            ]);
            await service.execute(CreateProcess(cycleA, ProcessMode.MANUAL, ExecutableAction.ON));
            expect(service.processList).toHaveLength(1);

            await service.execute(CreateProcess(cycleB, ProcessMode.MANUAL, ExecutableAction.ON, ProcessType.INIT));

            expect(eventRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    additionalData: expect.objectContaining({ status: ExecutableStatus.WAITTING_CONFIRMATION })
                })
            );

            // cycleA (maxDuration par defaut, 30ms) continue de tourner en arriere-plan : laisse
            // sa completion automatique (et son reset() interne) se terminer avant la fin du test.
            await Flush(80);
        });

        it('should require confirmation for a scheduled process with lower priority when shouldConfirmation is set', async () => {
            const [cycleA, cycleB] = await SeedCycles([
                { name: 'cycle-a', sequences: [{ moduleIds: ['shared-pump'] }], modePriority: [{ mode: ProcessMode.SCHEDULED, priority: 5 }] },
                { name: 'cycle-b', sequences: [{ moduleIds: ['shared-pump'] }], modePriority: [{ mode: ProcessMode.SCHEDULED, priority: 0 }] }
            ]);
            await service.execute(CreateProcess(cycleA, ProcessMode.SCHEDULED, ExecutableAction.ON));

            const process = CreateProcess(cycleB, ProcessMode.SCHEDULED, ExecutableAction.ON, ProcessType.INIT);
            process.schedule = Object.assign(new ScheduleModel(), { shouldConfirmation: true });
            await service.execute(process);

            expect(eventRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    additionalData: expect.objectContaining({ status: ExecutableStatus.WAITTING_CONFIRMATION })
                })
            );

            // cycleA (maxDuration par defaut, 30ms) continue de tourner en arriere-plan : laisse
            // sa completion automatique (et son reset() interne) se terminer avant la fin du test.
            await Flush(80);
        });

        it('should not require confirmation when the only conflicting process is a MODULE cycle sharing the actuator', async () => {
            // regle CYCLE<->MODULE (rule 1/rule 2) : un MODULE partageant l'actuator n'est jamais
            // un "conflit" a arbitrer via la priorite/confirmation - meme comportement qu'un cycle
            // demarre manuellement (type FORCE direct, qui ne passe meme pas par
            // _manageProcessMode). shouldConfirmation:true ne doit donc pas non plus declencher de
            // confirmation ici, puisque le seul "conflit" detecte est ce MODULE.
            const [cycleModule, cycle] = await SeedCycles([
                { name: 'module-x', type: CycleType.MODULE, sequences: [{ moduleIds: ['shared-pump'] }] },
                { name: 'cycle-a', sequences: [{ moduleIds: ['shared-pump'], maxDuration: 150 }] }
            ]);
            await service.execute(CreateProcess(cycleModule, ProcessMode.MANUAL, ExecutableAction.ON));
            expect(cycleModule.status).toEqual(ExecutableStatus.IN_PROCCESS);

            const process = CreateProcess(cycle, ProcessMode.SCHEDULED, ExecutableAction.ON, ProcessType.INIT);
            process.schedule = Object.assign(new ScheduleModel(), { shouldConfirmation: true });
            await service.execute(process);
            await Flush(50);

            expect(cycle.status).toEqual(ExecutableStatus.IN_PROCCESS);
            expect(eventRepository.save).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    additionalData: expect.objectContaining({ status: ExecutableStatus.WAITTING_CONFIRMATION })
                })
            );

            // laisse cycle-a se terminer naturellement (rule 2 eteint alors module-x
            // automatiquement), puis nettoyage explicite en filet de securite pour ne laisser
            // aucune chaine d'execution en vol au-dela de ce test (no-op si deja arrete).
            await Flush(250);
            await service.execute(CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.OFF));
            await service.execute(CreateProcess(cycleModule, ProcessMode.MANUAL, ExecutableAction.OFF));
        });

        it('should auto-force execution when the new process has priority over the conflicting one', async () => {
            const [cycleA, cycleB] = await SeedCycles([
                { name: 'cycle-a', sequences: [{ moduleIds: ['shared-pump'] }], modePriority: [{ mode: ProcessMode.MANUAL, priority: 5 }] },
                {
                    name: 'cycle-b',
                    sequences: [{ moduleIds: ['shared-pump'], maxDuration: 5000 }],
                    modePriority: [{ mode: ProcessMode.MANUAL, priority: 0 }]
                }
            ]);
            await service.execute(CreateProcess(cycleA, ProcessMode.MANUAL, ExecutableAction.ON));
            expect(cycleA.status).toEqual(ExecutableStatus.IN_PROCCESS);

            await service.execute(CreateProcess(cycleB, ProcessMode.MANUAL, ExecutableAction.ON, ProcessType.INIT));
            // ce chemin enchaine un reset() complet de cycleA (lui-meme asynchrone) avant de
            // demarrer cycleB : marge plus large que les autres tests bases sur Flush().
            await Flush(150);

            expect(cycleA.status).toEqual(ExecutableStatus.STOPPED);
            expect(cycleB.status).toEqual(ExecutableStatus.IN_PROCCESS);

            // cycleB (maxDuration=5000) est toujours en cours : le stopper explicitement plutot
            // que de laisser sa chaine d'execution en vol au-dela de ce test (fuite constatee vers
            // un autre test lorsque le nettoyage Mongo du test suivant intervient pendant qu'elle
            // tourne encore).
            await service.reset(CreateProcess(cycleB, ProcessMode.MANUAL, ExecutableAction.ON));
        });

        it('should clear a stale CONFIRMATION entry from the process list when force-executing after confirmation', async () => {
            const [cycleA, cycleB] = await SeedCycles([
                { name: 'cycle-a', sequences: [{ moduleIds: ['shared-pump'] }] },
                { name: 'cycle-b', sequences: [{ moduleIds: ['shared-pump'] }] }
            ]);
            await service.execute(CreateProcess(cycleA, ProcessMode.MANUAL, ExecutableAction.ON));
            await service.execute(CreateProcess(cycleB, ProcessMode.MANUAL, ExecutableAction.ON, ProcessType.INIT));
            expect(service.processList.some((p) => p.cycle._id === cycleB._id && p.type === ProcessType.CONFIRMATION)).toBe(true);

            await service.execute(CreateProcess(cycleB, ProcessMode.MANUAL, ExecutableAction.ON, ProcessType.FORCE));
            await Flush(150);

            expect(service.processList.some((p) => p.cycle._id === cycleB._id && p.type === ProcessType.CONFIRMATION)).toBe(false);
        });

        it('should skip executing a sequence whose condition is already satisfied', async () => {
            const condition = Object.assign(new ConditionModel(), {
                name: 'c', elementId: 'sensor-1', elementType: 'SENSOR', operator: '>', value: 5
            });
            const [cycle] = await SeedCycles([
                { name: 'cycle-1', sequences: [{ moduleIds: ['module-a'], maxDuration: 5000, conditions: [condition] }] }
            ]);
            valueRepository.getDeviceValue.mockResolvedValue({ value: 10 });

            await service.execute(CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.ON));
            // la sequence est immediatement "skippee" (setTimeout(...,0)) plutot que d'attendre
            // les 5000ms de maxDuration.
            await Flush(100);

            expect(cycle.status).toEqual(ExecutableStatus.STOPPED);
        });

        it('should switch off the previous sequence before switching on the next one in a multi-sequence cycle', async () => {
            const [cycle] = await SeedCycles([{
                name: 'cycle-1',
                sequences: [{ moduleIds: ['module-a'], maxDuration: 30 }, { moduleIds: ['module-b'], maxDuration: 30 }]
            }]);

            await service.execute(CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.ON));
            await Flush(300);

            expect(cycle.status).toEqual(ExecutableStatus.STOPPED);
            expect(actuatorService.execute).toHaveBeenCalledWith(expect.objectContaining({ _id: 'module-a' }), 1);
            expect(actuatorService.execute).toHaveBeenCalledWith(expect.objectContaining({ _id: 'module-a' }), 0);
            expect(actuatorService.execute).toHaveBeenCalledWith(expect.objectContaining({ _id: 'module-b' }), 1);
        });

        it('should wait before/after switching a module when timing config specifies delays', async () => {
            const [cycle] = await SeedCycles([{
                name: 'cycle-1',
                sequences: [{ moduleIds: ['module-a'], maxDuration: 30, configTiming: { waitBeforeExec: 20, waitAfterExec: 20 } }]
            }]);

            await service.execute(CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.ON));
            await Flush(200);

            expect(cycle.status).toEqual(ExecutableStatus.STOPPED);
            expect(actuatorService.execute).toHaveBeenCalledWith(expect.objectContaining({ _id: 'module-a' }), 1);
        });

        it('should log and reset when the execution observable errors', async () => {
            const cycle = await SeedCycle('cycle-1', ['module-a']);
            actuatorService.resolve
                .mockResolvedValueOnce(new Map()) // appel via _resetConflictedProcesses -> _getConflictedExecutables
                .mockRejectedValueOnce(new Error('resolve failed')); // appel via _execute() -> _executeWithActuators

            await service.execute(CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.ON));
            // le handler d'erreur appelle reset() (nouvel appel _resolveActuators + actuatorService.reset
            // + processProgress) : marge large pour le laisser se terminer avant la fin du test,
            // sinon il fuit et peut planter un AUTRE fichier de test execute plus tard.
            await Flush(300);

            expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), 'execution error');
        });
    });

    describe('cycle locking (rule 3)', () => {
        it('should ignore a duplicate ON command while the cycle is already IN_PROCCESS', async () => {
            const cycle = await SeedCycle('cycle-1', ['module-a'], 5000);
            await service.execute(CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.ON));
            expect(cycle.status).toEqual(ExecutableStatus.IN_PROCCESS);
            expect(service.processList).toHaveLength(1);
            actuatorService.execute.mockClear();

            await service.execute(CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.ON));

            expect(actuatorService.execute).not.toHaveBeenCalled();
            expect(service.processList).toHaveLength(1);

            await service.reset(CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.ON));
        });

        it('should still process OFF normally right after a duplicate ON was ignored', async () => {
            const cycle = await SeedCycle('cycle-1', ['module-a'], 5000);
            await service.execute(CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.ON));
            await service.execute(CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.ON)); // ignore, meme cycle deja en cours

            await service.execute(CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.OFF));

            expect(cycle.status).toEqual(ExecutableStatus.STOPPED);
            expect(service.processList).toHaveLength(0);
        });
    });

    describe('MODULE cycle cascade (rule 1)', () => {
        it('should immediately stop a CYCLE cycle sharing a RPI actuator when its MODULE cycle turns OFF', async () => {
            const [cycleC, cycleM] = await SeedCycles([
                { name: 'cycle-c', sequences: [{ moduleIds: ['shared-actuator'], maxDuration: 5000 }] },
                { name: 'cycle-m', type: CycleType.MODULE, sequences: [{ moduleIds: ['shared-actuator'] }] }
            ]);

            await service.execute(CreateProcess(cycleC, ProcessMode.MANUAL, ExecutableAction.ON));
            expect(cycleC.status).toEqual(ExecutableStatus.IN_PROCCESS);

            // un OFF sur le cycle MODULE (jamais demarre) ne toucherait normalement rien d'autre :
            // seule la cascade de la regle 1 explique l'arret de cycleC ici.
            await service.execute(CreateProcess(cycleM, ProcessMode.MANUAL, ExecutableAction.OFF));

            expect(cycleC.status).toEqual(ExecutableStatus.STOPPED);
            expect(actuatorService.reset).toHaveBeenCalled();
        });

        it('should not stop a CYCLE cycle sharing only a CTRL actuator with the MODULE cycle', async () => {
            actuatorTypeOverrides['shared-actuator'] = ActuatorType.CTRL;
            const [cycleC, cycleM] = await SeedCycles([
                { name: 'cycle-c', sequences: [{ moduleIds: ['shared-actuator'], maxDuration: 5000 }] },
                { name: 'cycle-m', type: CycleType.MODULE, sequences: [{ moduleIds: ['shared-actuator'] }] }
            ]);

            await service.execute(CreateProcess(cycleC, ProcessMode.MANUAL, ExecutableAction.ON));
            await service.execute(CreateProcess(cycleM, ProcessMode.MANUAL, ExecutableAction.OFF));

            expect(cycleC.status).toEqual(ExecutableStatus.IN_PROCCESS);

            await service.reset(CreateProcess(cycleC, ProcessMode.MANUAL, ExecutableAction.ON));
        });

        it('should stop every CYCLE cycle sharing any of the MODULE cycle actuators with a single command', async () => {
            const [cycleC1, cycleC2, cycleM] = await SeedCycles([
                { name: 'cycle-c1', sequences: [{ moduleIds: ['actuator-x'], maxDuration: 5000 }] },
                { name: 'cycle-c2', sequences: [{ moduleIds: ['actuator-y'], maxDuration: 5000 }] },
                { name: 'cycle-m', type: CycleType.MODULE, sequences: [{ moduleIds: ['actuator-x'] }, { moduleIds: ['actuator-y'] }] }
            ]);

            await service.execute(CreateProcess(cycleC1, ProcessMode.MANUAL, ExecutableAction.ON));
            await service.execute(CreateProcess(cycleC2, ProcessMode.MANUAL, ExecutableAction.ON));
            expect(cycleC1.status).toEqual(ExecutableStatus.IN_PROCCESS);
            expect(cycleC2.status).toEqual(ExecutableStatus.IN_PROCCESS);

            await service.execute(CreateProcess(cycleM, ProcessMode.MANUAL, ExecutableAction.OFF));

            expect(cycleC1.status).toEqual(ExecutableStatus.STOPPED);
            expect(cycleC2.status).toEqual(ExecutableStatus.STOPPED);
        });

        it('should not turn off an actuator still used by another active MODULE cycle when its sibling CYCLE is cascade-stopped', async () => {
            // cycle-a possede actuator-1 ET actuator-2, chacun pilote par son propre MODULE
            // (module-x / module-y). Arreter module-x doit cascade-stopper cycle-a (regle 1),
            // mais ne doit JAMAIS couper actuator-2 puisque module-y l'utilise encore activement.
            const [cycleA, moduleX, moduleY] = await SeedCycles([
                { name: 'cycle-a', sequences: [{ moduleIds: ['actuator-1', 'actuator-2'], maxDuration: 5000 }] },
                { name: 'module-x', type: CycleType.MODULE, sequences: [{ moduleIds: ['actuator-1'], maxDuration: 5000 }] },
                { name: 'module-y', type: CycleType.MODULE, sequences: [{ moduleIds: ['actuator-2'], maxDuration: 5000 }] }
            ]);

            await service.execute(CreateProcess(cycleA, ProcessMode.MANUAL, ExecutableAction.ON));
            await Flush(50);

            expect(cycleA.status).toEqual(ExecutableStatus.IN_PROCCESS);
            expect(moduleX.status).toEqual(ExecutableStatus.IN_PROCCESS);
            expect(moduleY.status).toEqual(ExecutableStatus.IN_PROCCESS);

            await service.execute(CreateProcess(moduleX, ProcessMode.MANUAL, ExecutableAction.OFF));

            expect(cycleA.status).toEqual(ExecutableStatus.STOPPED);
            expect(moduleX.status).toEqual(ExecutableStatus.STOPPED);
            // module-y n'a jamais ete touche par la cascade -> reste actif
            expect(moduleY.status).toEqual(ExecutableStatus.IN_PROCCESS);

            // actuator-2 (identifie par son _id d'origine, independant du nom calcule par le mock)
            // ne doit jamais recevoir de commande OFF tant que module-y tourne encore.
            expect(actuatorService.execute).not.toHaveBeenCalledWith(expect.objectContaining({ _id: 'actuator-2' }), 0);
            expect(actuatorService.reset).not.toHaveBeenCalledWith(
                expect.arrayContaining([expect.objectContaining({ _id: 'actuator-2' })])
            );
        });

        it('should not cascade-stop a GROUP-type cycle sharing the actuator', async () => {
            const [cycleG, cycleM] = await SeedCycles([
                { name: 'cycle-g', type: CycleType.GROUP, sequences: [{ moduleIds: ['shared-actuator'], maxDuration: 5000 }] },
                { name: 'cycle-m', type: CycleType.MODULE, sequences: [{ moduleIds: ['shared-actuator'] }] }
            ]);

            await service.execute(CreateProcess(cycleG, ProcessMode.MANUAL, ExecutableAction.ON));
            await service.execute(CreateProcess(cycleM, ProcessMode.MANUAL, ExecutableAction.OFF));

            expect(cycleG.status).toEqual(ExecutableStatus.IN_PROCCESS);

            await service.reset(CreateProcess(cycleG, ProcessMode.MANUAL, ExecutableAction.ON));
        });
    });

    describe('GROUP cycle orchestration', () => {
        function FullChildConfig(overrides: Partial<{
            order: number; waitForCompletion: boolean; delayBefore: number; delayAfter: number; isSkipped: boolean;
        }> = {}): { order: number; waitForCompletion: boolean; delayBefore: number; delayAfter: number; isSkipped: boolean } {
            return { order: 0, waitForCompletion: false, delayBefore: 0, delayAfter: 0, isSkipped: false, ...overrides };
        }

        async function SeedTrigger(cycleId: string, isPaused = true): Promise<TriggerModel> {
            const trigger = new TriggerModel();
            trigger.cycleId = cycleId;
            trigger.name = `${cycleId}-trigger`;
            trigger.conditions = [];
            trigger.trigger = { timeAfter: 1000 };
            trigger.delay = 0;
            trigger.isPaused = isPaused;
            trigger.action = ExecutableAction.ON;
            return triggerMongooseRepository.create(trigger);
        }

        async function SeedSchedule(cycleId: string, isPaused = true): Promise<ScheduleModel> {
            const schedule = new ScheduleModel();
            schedule.cycleId = cycleId;
            schedule.name = `${cycleId}-schedule`;
            schedule.cron = { pattern: '0 0 * * *' };
            schedule.isPaused = isPaused;
            return scheduleMongooseRepository.create(schedule);
        }

        // seede un Group referencant les enfants donnes (ids deja connus), puis rafraichit la
        // structure une seule fois : necessaire pour que le Group hydrate ses childCycles ET que
        // les enfants soient hydrates avec leurs triggers/schedules fraichement crees.
        async function SeedGroup(children: { cycleId: string; config?: Partial<ReturnType<typeof FullChildConfig>> }[]): Promise<CycleModel> {
            const group = await cycleRepository.save(CreateCycleModel({
                name: 'group',
                type: CycleType.GROUP,
                childCycles: children.map((child, index) => ({
                    cycleId: child.cycleId,
                    config: FullChildConfig({ order: index, ...child.config })
                }))
            }));
            // miroir de CycleGroupService.addChild : persiste aussi parentCycleId sur chaque enfant,
            // sinon aucun test ne peut exercer la logique "enfant de Group" (requiert ce champ).
            for (const child of children) {
                const current = structureService.structure.cycles.find((c) => c._id === child.cycleId);
                current.parentCycleId = group._id;
                await cycleRepository.save(current);
            }
            await structureService.getStructure();
            return structureService.structure.cycles.find((c) => c._id === group._id);
        }

        function FindCycle(id: string): CycleModel {
            return structureService.structure.cycles.find((c) => c._id === id);
        }

        it('should start a child cycle directly when it has neither trigger nor schedule', async () => {
            const [childDirect] = await SeedCycles([{ name: 'child-direct', sequences: [{ moduleIds: ['module-a'], maxDuration: 5000 }] }]);
            const group = await SeedGroup([{ cycleId: childDirect._id }]);

            await service.execute(CreateProcess(group, ProcessMode.MANUAL, ExecutableAction.ON));
            await Flush();

            expect(group.status).toEqual(ExecutableStatus.IN_PROCCESS);
            expect(FindCycle(childDirect._id).status).toEqual(ExecutableStatus.IN_PROCCESS);

            await service.execute(CreateProcess(group, ProcessMode.MANUAL, ExecutableAction.OFF));
        });

        it('should not start a child that owns a trigger, and instead un-pauses that trigger', async () => {
            const [childTriggered] = await SeedCycles([{ name: 'child-trigger', sequences: [{ moduleIds: ['module-a'], maxDuration: 5000 }] }]);
            const trigger = await SeedTrigger(childTriggered._id, true);
            const group = await SeedGroup([{ cycleId: childTriggered._id }]);

            await service.execute(CreateProcess(group, ProcessMode.MANUAL, ExecutableAction.ON));
            await Flush();

            expect(FindCycle(childTriggered._id).status).toEqual(ExecutableStatus.STOPPED);
            expect(triggerService.setPaused).toHaveBeenCalledWith(
                expect.objectContaining({ id: trigger.id, cycleId: childTriggered._id }), false
            );
        });

        it('should not start a child that owns a schedule, and instead un-pauses that schedule', async () => {
            const [childScheduled] = await SeedCycles([{ name: 'child-schedule', sequences: [{ moduleIds: ['module-a'], maxDuration: 5000 }] }]);
            const schedule = await SeedSchedule(childScheduled._id, true);
            const group = await SeedGroup([{ cycleId: childScheduled._id }]);

            await service.execute(CreateProcess(group, ProcessMode.MANUAL, ExecutableAction.ON));
            await Flush();

            expect(FindCycle(childScheduled._id).status).toEqual(ExecutableStatus.STOPPED);
            expect(scheduleService.setPaused).toHaveBeenCalledWith(
                expect.objectContaining({ _id: schedule._id, cycleId: childScheduled._id }), false
            );
        });

        it('should entirely skip a child marked isSkipped, whether it has a trigger or not', async () => {
            const [childSkipped] = await SeedCycles([{ name: 'child-skipped', sequences: [{ moduleIds: ['module-a'], maxDuration: 5000 }] }]);
            await SeedTrigger(childSkipped._id, true);
            const group = await SeedGroup([{ cycleId: childSkipped._id, config: { isSkipped: true } }]);

            await service.execute(CreateProcess(group, ProcessMode.MANUAL, ExecutableAction.ON));
            await Flush();

            expect(FindCycle(childSkipped._id).status).toEqual(ExecutableStatus.STOPPED);
            expect(triggerService.setPaused).not.toHaveBeenCalled();
        });

        it('should start direct children in order, waiting for completion before starting the next one', async () => {
            const [childA, childB] = await SeedCycles([
                { name: 'child-a', sequences: [{ moduleIds: ['module-a'], maxDuration: 80 }] },
                { name: 'child-b', sequences: [{ moduleIds: ['module-b'], maxDuration: 5000 }] }
            ]);
            const group = await SeedGroup([
                { cycleId: childA._id, config: { waitForCompletion: true } },
                { cycleId: childB._id }
            ]);

            await service.execute(CreateProcess(group, ProcessMode.MANUAL, ExecutableAction.ON));
            await Flush(20);

            // childA (80ms) doit demarrer tout de suite ; childB ne doit pas demarrer avant que
            // childA ne soit termine puisqu'il attend sa completion (waitForCompletion). La
            // completion de childA est detectee par polling (250ms) : marge large avant de verifier.
            expect(FindCycle(childA._id).status).toEqual(ExecutableStatus.IN_PROCCESS);
            expect(FindCycle(childB._id).status).toEqual(ExecutableStatus.STOPPED);

            await Flush(350);

            expect(FindCycle(childA._id).status).toEqual(ExecutableStatus.STOPPED);
            expect(FindCycle(childB._id).status).toEqual(ExecutableStatus.IN_PROCCESS);

            // childB (maxDuration=5000) tourne toujours : nettoyage explicite via l'arret du groupe
            // plutot que de laisser sa chaine d'execution en vol au-dela de ce test.
            await service.execute(CreateProcess(group, ProcessMode.MANUAL, ExecutableAction.OFF));
        });

        it('should stop running children and pause their triggers/schedules when the group turns OFF', async () => {
            const [childDirect, childTriggered] = await SeedCycles([
                { name: 'child-direct', sequences: [{ moduleIds: ['module-a'], maxDuration: 5000 }] },
                { name: 'child-trigger', sequences: [{ moduleIds: ['module-b'], maxDuration: 5000 }] }
            ]);
            const trigger = await SeedTrigger(childTriggered._id, true);
            const group = await SeedGroup([{ cycleId: childDirect._id }, { cycleId: childTriggered._id }]);

            await service.execute(CreateProcess(group, ProcessMode.MANUAL, ExecutableAction.ON));
            await Flush();
            expect(FindCycle(childDirect._id).status).toEqual(ExecutableStatus.IN_PROCCESS);
            expect(triggerService.setPaused).toHaveBeenCalledWith(expect.objectContaining({ id: trigger.id }), false);

            await service.execute(CreateProcess(group, ProcessMode.MANUAL, ExecutableAction.OFF));

            expect(group.status).toEqual(ExecutableStatus.STOPPED);
            expect(FindCycle(childDirect._id).status).toEqual(ExecutableStatus.STOPPED);
            expect(triggerService.setPaused).toHaveBeenCalledWith(expect.objectContaining({ id: trigger.id }), true);
        });

        it('should cancel a pending sequential start when the group is turned OFF mid-sequence', async () => {
            const [childA, childB] = await SeedCycles([
                { name: 'child-a', sequences: [{ moduleIds: ['module-a'], maxDuration: 5000 }] },
                { name: 'child-b', sequences: [{ moduleIds: ['module-b'], maxDuration: 5000 }] }
            ]);
            const group = await SeedGroup([
                { cycleId: childA._id, config: { waitForCompletion: true } },
                { cycleId: childB._id }
            ]);

            await service.execute(CreateProcess(group, ProcessMode.MANUAL, ExecutableAction.ON));
            await Flush(20);
            expect(FindCycle(childA._id).status).toEqual(ExecutableStatus.IN_PROCCESS);

            // childA (maxDuration=5000) tourne encore : OFF sur le groupe doit stopper childA et
            // empecher childB de demarrer une fois que l'attente de completion de childA se termine.
            await service.execute(CreateProcess(group, ProcessMode.MANUAL, ExecutableAction.OFF));
            await Flush(300);

            expect(FindCycle(childA._id).status).toEqual(ExecutableStatus.STOPPED);
            expect(FindCycle(childB._id).status).toEqual(ExecutableStatus.STOPPED);
        });

        it('should pause a manually-stopped child\'s own trigger while the group stays ON (other child still running)', async () => {
            const [childDirect, childTriggered] = await SeedCycles([
                { name: 'child-direct', sequences: [{ moduleIds: ['module-a'], maxDuration: 5000 }] },
                { name: 'child-trigger', sequences: [{ moduleIds: ['module-b'], maxDuration: 5000 }] }
            ]);
            const trigger = await SeedTrigger(childTriggered._id, true);
            const group = await SeedGroup([{ cycleId: childDirect._id }, { cycleId: childTriggered._id }]);

            await service.execute(CreateProcess(group, ProcessMode.MANUAL, ExecutableAction.ON));
            await Flush();
            expect(FindCycle(childDirect._id).status).toEqual(ExecutableStatus.IN_PROCCESS);

            // le trigger demarre reellement childTriggered (hors orchestration du groupe), puis on
            // arrete ce child directement (mode=MANUAL, pas via le Group).
            await service.execute(CreateProcess(childTriggered, ProcessMode.TRIGGER, ExecutableAction.ON));
            await Flush();
            expect(FindCycle(childTriggered._id).status).toEqual(ExecutableStatus.IN_PROCCESS);

            await service.execute(CreateProcess(childTriggered, ProcessMode.MANUAL, ExecutableAction.OFF));

            expect(FindCycle(childTriggered._id).status).toEqual(ExecutableStatus.STOPPED);
            expect(triggerService.setPaused).toHaveBeenCalledWith(expect.objectContaining({ id: trigger.id }), true);
            // childDirect tourne encore : le Group ne doit pas s'eteindre automatiquement.
            expect(group.status).toEqual(ExecutableStatus.IN_PROCCESS);

            await service.execute(CreateProcess(group, ProcessMode.MANUAL, ExecutableAction.OFF));
        });

        it('should auto turn the group OFF and pause ALL children triggers/schedules when the last active child is manually stopped', async () => {
            const [childDirect, childTriggered] = await SeedCycles([
                { name: 'child-direct', sequences: [{ moduleIds: ['module-a'], maxDuration: 5000 }] },
                { name: 'child-trigger', sequences: [{ moduleIds: ['module-b'], maxDuration: 5000 }] }
            ]);
            const trigger = await SeedTrigger(childTriggered._id, true);
            const group = await SeedGroup([{ cycleId: childDirect._id }, { cycleId: childTriggered._id }]);

            await service.execute(CreateProcess(group, ProcessMode.MANUAL, ExecutableAction.ON));
            await Flush();
            expect(FindCycle(childDirect._id).status).toEqual(ExecutableStatus.IN_PROCCESS);
            expect(FindCycle(childTriggered._id).status).toEqual(ExecutableStatus.STOPPED);

            // childTriggered est deja STOPPED (jamais demarre, son trigger a juste ete depause) :
            // arreter manuellement le seul autre enfant actif doit donc eteindre automatiquement le
            // Group, et re-pauser TOUS les triggers/schedules des enfants via _stopGroupChildren.
            await service.execute(CreateProcess(childDirect, ProcessMode.MANUAL, ExecutableAction.OFF));

            expect(FindCycle(childDirect._id).status).toEqual(ExecutableStatus.STOPPED);
            expect(group.status).toEqual(ExecutableStatus.STOPPED);
            expect(triggerService.setPaused).toHaveBeenCalledWith(expect.objectContaining({ id: trigger.id }), true);
        });

        it('should auto turn the group OFF when manually stopping a child that never actually started (trigger/schedule only)', async () => {
            // regression : reset() est un no-op pour un enfant qui n'a jamais reellement demarre
            // (son status etait deja STOPPED et il n'est jamais entre dans processList, puisque
            // seul son trigger a ete depause par le Group). Sans l'appel explicite ajoute dans le
            // garde-fou OFF manuel, l'auto-sync du Group ne se declenchait alors JAMAIS pour ce
            // type d'enfant, meme apres un clic "stop" manuel sur lui - le Group restait ON pour
            // toujours des lors que TOUS ses enfants etaient de ce type.
            const [childTriggered] = await SeedCycles([{ name: 'child-trigger', sequences: [{ moduleIds: ['module-a'], maxDuration: 5000 }] }]);
            const trigger = await SeedTrigger(childTriggered._id, true);
            const group = await SeedGroup([{ cycleId: childTriggered._id }]);

            await service.execute(CreateProcess(group, ProcessMode.MANUAL, ExecutableAction.ON));
            await Flush();
            expect(FindCycle(childTriggered._id).status).toEqual(ExecutableStatus.STOPPED);
            expect(group.status).toEqual(ExecutableStatus.IN_PROCCESS);

            await service.execute(CreateProcess(childTriggered, ProcessMode.MANUAL, ExecutableAction.OFF));

            expect(triggerService.setPaused).toHaveBeenCalledWith(expect.objectContaining({ id: trigger.id }), true);
            expect(group.status).toEqual(ExecutableStatus.STOPPED);
        });

        it('should unpause a child\'s trigger on manual ON without starting it or touching the untouched group', async () => {
            const [childTriggered] = await SeedCycles([{ name: 'child-trigger', sequences: [{ moduleIds: ['module-a'], maxDuration: 5000 }] }]);
            const trigger = await SeedTrigger(childTriggered._id, true);
            const group = await SeedGroup([{ cycleId: childTriggered._id }]);

            await service.execute(CreateProcess(childTriggered, ProcessMode.MANUAL, ExecutableAction.ON));

            expect(triggerService.setPaused).toHaveBeenCalledWith(expect.objectContaining({ id: trigger.id }), false);
            expect(FindCycle(childTriggered._id).status).toEqual(ExecutableStatus.STOPPED);
            expect(FindCycle(group._id).status).toEqual(ExecutableStatus.STOPPED);
        });

        it('should start a child directly on manual ON when it owns neither trigger nor schedule, without touching the group', async () => {
            const [childDirect] = await SeedCycles([{ name: 'child-direct', sequences: [{ moduleIds: ['module-a'], maxDuration: 5000 }] }]);
            const group = await SeedGroup([{ cycleId: childDirect._id }]);

            await service.execute(CreateProcess(childDirect, ProcessMode.MANUAL, ExecutableAction.ON));

            expect(FindCycle(childDirect._id).status).toEqual(ExecutableStatus.IN_PROCCESS);
            expect(FindCycle(group._id).status).toEqual(ExecutableStatus.STOPPED);

            await service.execute(CreateProcess(childDirect, ProcessMode.MANUAL, ExecutableAction.OFF));
        });

        it('should auto turn the group OFF when its only child stops naturally (non-manual cause)', async () => {
            const [childDirect] = await SeedCycles([{ name: 'child-direct', sequences: [{ moduleIds: ['module-a'], maxDuration: 80 }] }]);
            const group = await SeedGroup([{ cycleId: childDirect._id }]);

            await service.execute(CreateProcess(group, ProcessMode.MANUAL, ExecutableAction.ON));
            await Flush(20);
            expect(group.status).toEqual(ExecutableStatus.IN_PROCCESS);
            expect(FindCycle(childDirect._id).status).toEqual(ExecutableStatus.IN_PROCCESS);

            // aucun OFF explicite envoye : childDirect (maxDuration=80ms) se termine tout seul, ce
            // qui doit declencher l'auto-sync du Group depuis reset() (pas seulement depuis un arret
            // manuel explicite).
            await Flush(300);

            expect(FindCycle(childDirect._id).status).toEqual(ExecutableStatus.STOPPED);
            expect(group.status).toEqual(ExecutableStatus.STOPPED);
        });
    });

    describe('CYCLE manual stop cascade (rule 1, reverse direction)', () => {
        it('should stop every MODULE cycle sharing any of the CYCLE actuators when the CYCLE is manually force-stopped', async () => {
            const [cycleA, moduleX, moduleY] = await SeedCycles([
                { name: 'cycle-a', sequences: [{ moduleIds: ['actuator-1', 'actuator-2'], maxDuration: 5000 }] },
                { name: 'module-x', type: CycleType.MODULE, sequences: [{ moduleIds: ['actuator-1'], maxDuration: 5000 }] },
                { name: 'module-y', type: CycleType.MODULE, sequences: [{ moduleIds: ['actuator-2'], maxDuration: 5000 }] }
            ]);

            await service.execute(CreateProcess(cycleA, ProcessMode.MANUAL, ExecutableAction.ON));
            await Flush(50);
            expect(cycleA.status).toEqual(ExecutableStatus.IN_PROCCESS);
            expect(moduleX.status).toEqual(ExecutableStatus.IN_PROCCESS);
            expect(moduleY.status).toEqual(ExecutableStatus.IN_PROCCESS);

            // arret MANUEL direct de cycle-a (jamais via la cascade regle 1)
            await service.execute(CreateProcess(cycleA, ProcessMode.MANUAL, ExecutableAction.OFF));

            expect(cycleA.status).toEqual(ExecutableStatus.STOPPED);
            expect(moduleX.status).toEqual(ExecutableStatus.STOPPED);
            expect(moduleY.status).toEqual(ExecutableStatus.STOPPED);

            // contraste avec le test rule-1 direct existant : ici les DEUX actuators doivent etre
            // coupes puisque c'est un arret manuel du CYCLE lui-meme (pas une cascade depuis un MODULE).
            expect(actuatorService.reset).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ _id: 'actuator-1' }),
                    expect.objectContaining({ _id: 'actuator-2' })
                ])
            );
        });
    });

    describe('CYCLE driving its owning MODULE cycle at actuator-switch time (rule 2)', () => {
        it('should turn the owning MODULE cycle ON only once the CYCLE actually switches the actuator, then OFF once it releases it', async () => {
            const [cycleC, cycleM] = await SeedCycles([
                { name: 'cycle-c', sequences: [{ moduleIds: ['actuator-x'], maxDuration: 300 }] },
                // maxDuration large pour que le cycle M n'expire pas de lui-meme avant que cycleC
                // ne le libere explicitement (regle 2) : seule cette liberation doit l'eteindre ici.
                { name: 'cycle-m', type: CycleType.MODULE, sequences: [{ moduleIds: ['actuator-x'], maxDuration: 5000 }] }
            ]);

            await service.execute(CreateProcess(cycleC, ProcessMode.MANUAL, ExecutableAction.ON));
            // pas au demarrage du cycle CYCLE
            expect(cycleM.status).toEqual(ExecutableStatus.STOPPED);

            await Flush(50);
            // ...mais bien une fois l'actuator effectivement commute
            expect(cycleC.status).toEqual(ExecutableStatus.IN_PROCCESS);
            expect(cycleM.status).toEqual(ExecutableStatus.IN_PROCCESS);

            await Flush(400);
            // cycleC a fini sa sequence -> le MODULE redescend avec lui
            expect(cycleC.status).toEqual(ExecutableStatus.STOPPED);
            expect(cycleM.status).toEqual(ExecutableStatus.STOPPED);
        });

        it('should never trigger the owning MODULE cycle for a CTRL actuator', async () => {
            actuatorTypeOverrides['actuator-ctrl'] = ActuatorType.CTRL;
            const [cycleC, cycleM] = await SeedCycles([
                { name: 'cycle-c', sequences: [{ moduleIds: ['actuator-ctrl'], maxDuration: 30 }] },
                { name: 'cycle-m', type: CycleType.MODULE, sequences: [{ moduleIds: ['actuator-ctrl'] }] }
            ]);

            await service.execute(CreateProcess(cycleC, ProcessMode.MANUAL, ExecutableAction.ON));
            await Flush(200);

            expect(cycleC.status).toEqual(ExecutableStatus.STOPPED);
            expect(cycleM.status).toEqual(ExecutableStatus.STOPPED);
        });

        it('should not stop the driving CYCLE itself via its own MODULE cycle cascade (reentrancy guard)', async () => {
            const [cycleC, cycleM] = await SeedCycles([
                { name: 'cycle-c', sequences: [{ moduleIds: ['actuator-x'], maxDuration: 300 }] },
                { name: 'cycle-m', type: CycleType.MODULE, sequences: [{ moduleIds: ['actuator-x'], maxDuration: 5000 }] }
            ]);

            await service.execute(CreateProcess(cycleC, ProcessMode.MANUAL, ExecutableAction.ON));
            await Flush(50);

            expect(cycleM.status).toEqual(ExecutableStatus.IN_PROCCESS);
            // cycleC ne doit pas avoir ete stoppe par la cascade (regle 1) declenchee via son propre MODULE
            expect(cycleC.status).toEqual(ExecutableStatus.IN_PROCCESS);

            await Flush(400);
        });

        it('should toggle the MODULE cycle OFF then ON again across two sequential CYCLE cycles using the same actuator', async () => {
            const [cycleC1, cycleC2, cycleM] = await SeedCycles([
                { name: 'cycle-c1', sequences: [{ moduleIds: ['actuator-x'], maxDuration: 30 }] },
                { name: 'cycle-c2', sequences: [{ moduleIds: ['actuator-x'], maxDuration: 300 }] },
                { name: 'cycle-m', type: CycleType.MODULE, sequences: [{ moduleIds: ['actuator-x'], maxDuration: 5000 }] }
            ]);

            await service.execute(CreateProcess(cycleC1, ProcessMode.MANUAL, ExecutableAction.ON));
            await Flush(200);
            expect(cycleC1.status).toEqual(ExecutableStatus.STOPPED);
            expect(cycleM.status).toEqual(ExecutableStatus.STOPPED);

            await service.execute(CreateProcess(cycleC2, ProcessMode.MANUAL, ExecutableAction.ON));
            await Flush(50);
            // le verrou de la regle 3 ne doit pas empecher M de redemarrer pour cycleC2
            expect(cycleM.status).toEqual(ExecutableStatus.IN_PROCCESS);

            await Flush(300);
            expect(cycleC2.status).toEqual(ExecutableStatus.STOPPED);
            expect(cycleM.status).toEqual(ExecutableStatus.STOPPED);
        });

        it('should trigger the owning MODULE cycle OFF via the final-sequence completion path', async () => {
            const [cycleC, cycleM] = await SeedCycles([
                {
                    name: 'cycle-c',
                    sequences: [{ moduleIds: ['module-a'], maxDuration: 10 }, { moduleIds: ['actuator-x'], maxDuration: 300 }]
                },
                { name: 'cycle-m', type: CycleType.MODULE, sequences: [{ moduleIds: ['actuator-x'], maxDuration: 5000 }] }
            ]);

            await service.execute(CreateProcess(cycleC, ProcessMode.MANUAL, ExecutableAction.ON));
            await Flush(50);
            // en cours de la 2e (et derniere) sequence : M doit etre ON
            expect(cycleM.status).toEqual(ExecutableStatus.IN_PROCCESS);

            await Flush(400);
            // fin du cycle via le tap final -> M repasse OFF
            expect(cycleC.status).toEqual(ExecutableStatus.STOPPED);
            expect(cycleM.status).toEqual(ExecutableStatus.STOPPED);
        });
    });

    describe('executeModuleCycleForDigitalOutput', () => {
        const deviceId = 'io-8ch-1';

        // le nom '100' reproduit ce que renvoie CreateFakeActuator(id, 100 + i, ...) pour le
        // premier (et seul) moduleId d'une sequence : cycle.exists() matche par nom, pas par id.
        function CreateComActuatorModel(id: string, name: string, digitalPort: number): ActuatorModel {
            const actuator = new ActuatorModel();
            actuator._id = id;
            actuator.name = name;
            actuator.type = ActuatorType.COM;
            actuator.status = ModuleStatus.OFF;
            const config = new ComActuatorConfigModel();
            config.deviceId = deviceId;
            config.actions = [{ comRequestId: 'com-req-1', action: ComActuatorAction.ON, digitalPort, type: DigitalPortType.OUTPUT }];
            actuator.config = config;
            return actuator;
        }

        it('should turn ON the MODULE cycle owning the COM actuator mapped to the changed digital output', async () => {
            actuatorTypeOverrides['actuator-com-1'] = ActuatorType.COM;
            const [cycleM] = await SeedCycles([
                { name: 'cycle-m', type: CycleType.MODULE, sequences: [{ moduleIds: ['actuator-com-1'], maxDuration: 5000 }] }
            ]);
            structureService.structure.actuators = [CreateComActuatorModel('actuator-com-1', '100', 2)];

            await service.executeModuleCycleForDigitalOutput(deviceId, 2, true);
            await Flush(50);

            expect(cycleM.status).toEqual(ExecutableStatus.IN_PROCCESS);

            // evite de laisser trainer le timer reel de maxDuration (5000ms) de la sequence :
            // sans ce cleanup il se declenche bien apres la fin du test, avec des mocks deja
            // reinitialises par un test suivant (cf. commentaire sur le leak de reset() plus haut).
            await service.executeModuleCycleForDigitalOutput(deviceId, 2, false);
            await Flush(50);
        });

        it('should turn OFF the MODULE cycle when the digital output goes low', async () => {
            actuatorTypeOverrides['actuator-com-1'] = ActuatorType.COM;
            const [cycleM] = await SeedCycles([
                { name: 'cycle-m', type: CycleType.MODULE, sequences: [{ moduleIds: ['actuator-com-1'], maxDuration: 5000 }] }
            ]);
            structureService.structure.actuators = [CreateComActuatorModel('actuator-com-1', '100', 2)];

            await service.executeModuleCycleForDigitalOutput(deviceId, 2, true);
            await Flush(50);
            expect(cycleM.status).toEqual(ExecutableStatus.IN_PROCCESS);

            await service.executeModuleCycleForDigitalOutput(deviceId, 2, false);
            await Flush(50);
            expect(cycleM.status).toEqual(ExecutableStatus.STOPPED);
        });

        it('should stop a CYCLE process sharing the mapped COM actuator (rule 1) when triggered from monitoring', async () => {
            actuatorTypeOverrides['actuator-com-1'] = ActuatorType.COM;
            const [cycleC, cycleM] = await SeedCycles([
                { name: 'cycle-c', sequences: [{ moduleIds: ['actuator-com-1'], maxDuration: 5000 }] },
                { name: 'cycle-m', type: CycleType.MODULE, sequences: [{ moduleIds: ['actuator-com-1'], maxDuration: 5000 }] }
            ]);
            // deux cycles referencent 'actuator-com-1' ici (cycle-c puis cycle-m) : structure.getModuleIds()
            // le liste deux fois, et le Map de actuatorService.resolve() dedup sur la derniere occurrence
            // (index 1, cf. CreateFakeActuator(id, 100 + i, ...)) -> nom resolu '101', pas '100'.
            structureService.structure.actuators = [CreateComActuatorModel('actuator-com-1', '101', 2)];

            await service.execute(CreateProcess(cycleC, ProcessMode.MANUAL, ExecutableAction.ON));
            expect(cycleC.status).toEqual(ExecutableStatus.IN_PROCCESS);

            // a la difference de la regle 2 (_triggerOwningModuleCycle, mode AUTO), un ON/OFF
            // declenche depuis le monitoring n'a pas de cycle CYCLE amont a proteger : il doit donc
            // appliquer la regle 1 normalement et arreter cycleC.
            await service.executeModuleCycleForDigitalOutput(deviceId, 2, true);
            await Flush(50);

            expect(cycleC.status).toEqual(ExecutableStatus.STOPPED);
            expect(actuatorService.reset).toHaveBeenCalled();

            await service.executeModuleCycleForDigitalOutput(deviceId, 2, false);
            await Flush(50);
        });

        it('should not cascade-stop the driving CYCLE when monitoring echoes a change rule 2 already made (regression)', async () => {
            actuatorTypeOverrides['actuator-com-1'] = ActuatorType.COM;
            const [cycleC, cycleM] = await SeedCycles([
                { name: 'cycle-c', sequences: [{ moduleIds: ['actuator-com-1'], maxDuration: 300 }] },
                { name: 'cycle-m', type: CycleType.MODULE, sequences: [{ moduleIds: ['actuator-com-1'], maxDuration: 5000 }] }
            ]);
            // cf. commentaire plus haut : deux cycles referencent 'actuator-com-1' -> nom resolu '101'.
            structureService.structure.actuators = [CreateComActuatorModel('actuator-com-1', '101', 2)];

            // regle 2 : cycleC ON demarre automatiquement cycleM (son cycle MODULE proprietaire).
            await service.execute(CreateProcess(cycleC, ProcessMode.MANUAL, ExecutableAction.ON));
            await Flush(50);
            expect(cycleC.status).toEqual(ExecutableStatus.IN_PROCCESS);
            expect(cycleM.status).toEqual(ExecutableStatus.IN_PROCCESS);

            // simule l'echo du monitoring detectant, ~500ms plus tard, la sortie physique deja mise
            // a ON par la regle 2 elle-meme : sans le garde no-op, ce second appel (sans
            // sourceCycleId) declenchait a tort la regle 1 et arretait cycleC.
            await service.executeModuleCycleForDigitalOutput(deviceId, 2, true);
            await Flush(50);

            expect(cycleC.status).toEqual(ExecutableStatus.IN_PROCCESS);
            expect(cycleM.status).toEqual(ExecutableStatus.IN_PROCCESS);

            // cycleC (maxDuration 300) se termine naturellement et libere cycleM avec lui (regle 2) :
            // evite de laisser trainer le timer reel de 5000ms de cycleM.
            await Flush(400);
            expect(cycleC.status).toEqual(ExecutableStatus.STOPPED);
            expect(cycleM.status).toEqual(ExecutableStatus.STOPPED);
        });

        it('should do nothing when no COM actuator matches the deviceId/digitalPort', async () => {
            actuatorTypeOverrides['actuator-com-1'] = ActuatorType.COM;
            const [cycleM] = await SeedCycles([
                { name: 'cycle-m', type: CycleType.MODULE, sequences: [{ moduleIds: ['actuator-com-1'], maxDuration: 5000 }] }
            ]);
            structureService.structure.actuators = [CreateComActuatorModel('actuator-com-1', '100', 2)];

            await service.executeModuleCycleForDigitalOutput(deviceId, 5, true);
            await Flush(50);

            expect(cycleM.status).toEqual(ExecutableStatus.STOPPED);
        });

        it('should do nothing when the matched actuator is not referenced by any MODULE cycle', async () => {
            await SeedCycles([]);
            structureService.structure.actuators = [CreateComActuatorModel('actuator-com-orphan', '999', 2)];

            await expect(service.executeModuleCycleForDigitalOutput(deviceId, 2, true)).resolves.toBeUndefined();
            expect(actuatorService.execute).not.toHaveBeenCalled();
        });
    });

    describe('reset', () => {
        it('should stop the cycle, unsubscribe its execution and reset its actuator modules', async () => {
            const cycle = await SeedCycle('cycle-1', ['module-a'], 1000);
            const process = CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.ON);
            await service.execute(process);
            expect(cycle.status).toEqual(ExecutableStatus.IN_PROCCESS);

            await service.reset(process);

            expect(cycle.status).toEqual(ExecutableStatus.STOPPED);
            expect(actuatorService.reset).toHaveBeenCalled();
        });

        it('should explicitly turn off a sequence that is not yet reported as stopped', async () => {
            const cycle = await SeedCycle('cycle-1', ['module-a'], 1000);
            const process = CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.ON);
            await service.execute(process);
            // simule une sequence pas encore repassee a STOPPED en memoire (le statut vit
            // desormais directement sur le modele, plus besoin de mocker un store separe).
            cycle.sequences[0].status = ExecutableStatus.IN_PROCCESS;

            await service.reset(process);

            expect(eventRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    elementType: 'SEQUENCE',
                    additionalData: expect.objectContaining({ status: ExecutableStatus.STOPPED })
                })
            );
        });
    });

    describe('testAllModules', () => {
        it('should execute every persisted cycle', async () => {
            await SeedCycles([
                { name: 'cycle-a', sequences: [{ moduleIds: ['module-a'] }] },
                { name: 'cycle-b', sequences: [{ moduleIds: ['module-b'] }] }
            ]);

            await service.testAllModules();

            expect(actuatorService.execute).toHaveBeenCalled();
        });
    });

    describe('resetAllModules', () => {
        it('should reset every persisted cycle to STOPPED', async () => {
            await SeedCycles([
                { name: 'cycle-a', sequences: [{ moduleIds: ['module-a'] }] },
                { name: 'cycle-b', sequences: [{ moduleIds: ['module-b'] }] }
            ]);

            await service.resetAllModules();

            expect(actuatorService.reset).toHaveBeenCalledTimes(2);
            // les sequences persistees en Mongo doivent aussi avoir ete visitees (_initialReset
            // itere process.cycle.sequences), pas seulement le cycle lui-meme.
            expect(eventRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    elementType: 'SEQUENCE',
                    additionalData: expect.objectContaining({ status: ExecutableStatus.STOPPED })
                })
            );
        });
    });

    describe('module switch failure handling', () => {
        it('should log a warning and continue when a actuator module fails to switch', async () => {
            const cycle = await SeedCycle('cycle-1', ['module-a']);
            actuatorService.execute.mockRejectedValueOnce(new Error('actuator failure'));

            await service.execute(CreateProcess(cycle, ProcessMode.MANUAL, ExecutableAction.ON));
            await Flush(100);

            expect(logger.warn).toHaveBeenCalledWith(
                expect.objectContaining({ error: expect.any(Error), name: expect.any(String) }),
                'execution module error'
            );
            expect(cycle.status).toEqual(ExecutableStatus.STOPPED);
        });
    });

    describe('applyInverterConfig', () => {
        it('should delegate to ModbusTaskService.applyInverterConfig', async () => {
            const params = [{ param: 'F00.11', value: 4200 }];

            await service.applyInverterConfig('inverter-001', params as never);

            expect(modBusService.applyInverterConfig).toHaveBeenCalledWith('inverter-001', params);
        });
    });
});
