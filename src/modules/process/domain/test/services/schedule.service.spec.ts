import { Test } from '@nestjs/testing';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { Connection } from 'mongoose';
import { ScheduleService } from '@process/domain/services/schedule.service';
import { StructureService } from '@process/domain/services/configuration.service';
import { ProcessService } from '@process/domain/services/execution.service';
import { CycleRepository } from '@process/infrastructure/repositories/cycle.repository';
import { CycleMongooseRepository } from '@process/infrastructure/repositories/cycle-mongoose.repository';
import { SequenceMongooseRepository } from '@process/infrastructure/repositories/sequence-mongoose.repository';
import { ScheduleRepository } from '@process/infrastructure/repositories/schedule.repository';
import { ScheduleMongooseRepository } from '@process/infrastructure/repositories/schedule-mongoose.repository';
import { TriggerMongooseRepository } from '@process/infrastructure/repositories/trigger-mongoose.repository';
import { Cycle, CycleSchema } from '@process/infrastructure/schemas/cycle.schema';
import { Sequence, SequenceSchema } from '@process/infrastructure/schemas/sequence.schema';
import { Schedule, ScheduleSchema } from '@process/infrastructure/schemas/schedule.schema';
import { Trigger, TriggerSchema } from '@process/infrastructure/schemas/trigger.schema';
import { ScheduleModel } from '@process/domain/models/schedule.model';
import { CycleModel } from '@process/domain/models/cycle.model';
import { ExecutableAction, ProcessType } from '@process/domain/interfaces/executable.interface';
import { SunState } from '@process/domain/interfaces/schedule.interface';
import { StartMongoMemory, StopMongoMemory } from './mongo-memory.spec-mock';
import { CreateCycleModel } from './cycle.spec-mock';
import { CreateScheduleModel } from './schedule.spec-mock';

function CreateLoggerMock(): { log: jest.Mock; debug: jest.Mock; warn: jest.Mock; error: jest.Mock } {
    return { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

// ProcessService.execute() declenche l'execution reelle d'un cycle (actionneurs/GPIO inclus) : on le
// mocke toujours, jamais d'instance reelle dans ces tests (cf. le meme principe applique a
// ActuatorService/onoff dans actuator.service.spec.ts).
function CreateProcessServiceMock(): { execute: jest.Mock } {
    return { execute: jest.fn().mockResolvedValue(undefined) };
}

describe('ScheduleService', () => {
    let mongod: Awaited<ReturnType<typeof StartMongoMemory>>['mongod'];
    let connection: Connection;
    let schedulerRegistry: SchedulerRegistry;
    let cycleRepository: CycleRepository;
    let scheduleRepository: ScheduleRepository;
    let configurationService: { schedules: ScheduleModel[]; structure: { cycles: CycleModel[] } };
    let processService: { execute: jest.Mock };
    let logger: ReturnType<typeof CreateLoggerMock>;
    let service: ScheduleService;

    beforeAll(async () => {
        ({ mongod, connection } = await StartMongoMemory());

        const cycleModel = connection.model(Cycle.name, CycleSchema);
        const sequenceModel = connection.model(Sequence.name, SequenceSchema);
        const scheduleModel = connection.model(Schedule.name, ScheduleSchema);
        const triggerModel = connection.model(Trigger.name, TriggerSchema);

        const sequenceMongooseRepository = new SequenceMongooseRepository(sequenceModel as never);
        const scheduleMongooseRepository = new ScheduleMongooseRepository(scheduleModel as never);
        const triggerMongooseRepository = new TriggerMongooseRepository(triggerModel as never);

        // ScheduleService n'utilise que CycleRepository.get() (jamais save/delete/replaceAll),
        // donc seul le CycleMongooseRepository (avec sa vraie hydratation) a besoin d'etre reel :
        // les 3 autres wrappers de CycleRepository restent des stubs inutilises ici.
        scheduleRepository = new ScheduleRepository(scheduleMongooseRepository);
        cycleRepository = new CycleRepository(
            new CycleMongooseRepository(cycleModel as never, sequenceMongooseRepository, scheduleMongooseRepository, triggerMongooseRepository),
            {} as never,
            {} as never,
            {} as never
        );

        const testingModule = await Test.createTestingModule({ imports: [ScheduleModule.forRoot()] }).compile();
        schedulerRegistry = testingModule.get(SchedulerRegistry);
    }, 120000);

    afterAll(async () => {
        // les CronJob crees par les tests gardent un timer actif tant qu'ils ne sont pas stoppes,
        // ce qui empeche jest de quitter proprement en fin de suite.
        for (const name of schedulerRegistry.getCronJobs().keys()) {
            schedulerRegistry.deleteCronJob(name);
        }
        await StopMongoMemory(mongod, connection);
    });

    beforeEach(async () => {
        await connection.collection('cycles').deleteMany({});
        await connection.collection('schedules').deleteMany({});
        for (const name of schedulerRegistry.getCronJobs().keys()) {
            schedulerRegistry.deleteCronJob(name);
        }
        configurationService = { schedules: [], structure: { cycles: [] } };
        processService = CreateProcessServiceMock();
        logger = CreateLoggerMock();
        service = new ScheduleService(
            schedulerRegistry,
            configurationService as unknown as StructureService,
            processService as unknown as ProcessService,
            cycleRepository,
            scheduleRepository,
            logger as never
        );
    });

    describe('createSchedule', () => {
        it('should register and start a cron job for a pattern-based schedule', () => {
            const schedule = CreateScheduleModel({ isPaused: false });

            const result = service.createSchedule(schedule, jest.fn());

            expect(result).toBe(schedule);
            expect(schedulerRegistry.doesExist('cron', schedule._id)).toBe(true);
            expect(schedulerRegistry.getCronJob(schedule._id).isActive).toBe(true);
        });

        it('should register but not start the job when the schedule is paused', () => {
            const schedule = CreateScheduleModel({ isPaused: true });

            service.createSchedule(schedule, jest.fn());

            expect(schedulerRegistry.getCronJob(schedule._id).isActive).toBe(false);
        });

        it('should replace an existing job registered under the same id', () => {
            const schedule = CreateScheduleModel();
            service.createSchedule(schedule, jest.fn());
            const firstJob = schedulerRegistry.getCronJob(schedule._id);
            const stopSpy = jest.spyOn(firstJob, 'stop');

            service.createSchedule(schedule, jest.fn());

            expect(stopSpy).toHaveBeenCalled();
            expect(schedulerRegistry.getCronJobs().size).toEqual(1);
            expect(schedulerRegistry.getCronJob(schedule._id)).not.toBe(firstJob);
        });

        it('should log an error and not throw when the cron expression is invalid', () => {
            const schedule = CreateScheduleModel({ cron: { pattern: 'not-a-valid-cron-expression' } });

            expect(() => service.createSchedule(schedule, jest.fn())).not.toThrow();

            expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ error: expect.anything() }), 'createSchedule failed');
        });

        it('should register a sun-based schedule without throwing', () => {
            const schedule = CreateScheduleModel({ cron: { sunBehavior: { sunState: SunState.SUNRISE, time: 0 } } });

            expect(() => service.createSchedule(schedule, jest.fn())).not.toThrow();

            expect(schedulerRegistry.doesExist('cron', schedule._id)).toBe(true);
        });
    });

    describe('deleteCronJob', () => {
        it('should remove an existing job from the registry', async () => {
            const schedule = CreateScheduleModel();
            service.createSchedule(schedule, jest.fn());

            await service.deleteCronJob(schedule._id);

            expect(schedulerRegistry.doesExist('cron', schedule._id)).toBe(false);
        });

        it('should delete the persisted schedule when it is tracked in configurationService.schedules', async () => {
            const schedule = CreateScheduleModel();
            await scheduleRepository.save(schedule);
            configurationService.schedules.push(schedule);
            service.createSchedule(schedule, jest.fn());

            await service.deleteCronJob(schedule._id);

            expect(await scheduleRepository.get(schedule._id)).toBeNull();
        });

        it('should not touch persistence when the schedule is not tracked in configurationService.schedules', async () => {
            const schedule = CreateScheduleModel();
            const deleteSpy = jest.spyOn(scheduleRepository, 'delete');
            service.createSchedule(schedule, jest.fn());

            await service.deleteCronJob(schedule._id);

            expect(deleteSpy).not.toHaveBeenCalled();
        });

        it('should log a warning even when the job does not exist', async () => {
            await service.deleteCronJob('unknown-schedule');

            expect(logger.warn).toHaveBeenCalledWith({ scheduleId: 'unknown-schedule' }, 'cron job deleted');
        });
    });

    describe('initSchedule', () => {
        it('should track the schedule and register its cron job when not deleted', async () => {
            const schedule = CreateScheduleModel();

            await service.initSchedule(schedule, false, undefined, undefined, jest.fn());

            expect(configurationService.schedules).toContain(schedule);
            expect(schedulerRegistry.doesExist('cron', schedule._id)).toBe(true);
        });

        it('should untrack the schedule and remove its cron job when deleted', async () => {
            const schedule = CreateScheduleModel();
            await service.initSchedule(schedule, false, undefined, undefined, jest.fn());

            await service.initSchedule(schedule, true);

            expect(configurationService.schedules).not.toContain(schedule);
            expect(schedulerRegistry.doesExist('cron', schedule._id)).toBe(false);
        });

        it('should execute the scheduled process once the cron tick and its internal delay complete', async () => {
            let pendingCallback: Promise<void>;
            const setTimeoutSpy = jest.spyOn(global, 'setTimeout')
                .mockImplementation(((fn: () => Promise<void>) => { pendingCallback = fn(); return 0; }) as never);
            const cycle = CreateCycleModel({ _id: 'cycle-1' });
            configurationService.structure.cycles = [cycle];
            const schedule = CreateScheduleModel({ cycleId: 'cycle-1', isPaused: false, cron: { pattern: '0 0 1 1 *', after: 10 } });

            await service.initSchedule(schedule);
            await schedulerRegistry.getCronJob(schedule._id).fireOnTick();
            await pendingCallback;

            expect(processService.execute).toHaveBeenCalledWith(expect.objectContaining({ cycle, action: ExecutableAction.ON }));
            setTimeoutSpy.mockRestore();
        });

        it('should not execute the scheduled process when the schedule is paused', async () => {
            let pendingCallback: Promise<void>;
            const setTimeoutSpy = jest.spyOn(global, 'setTimeout')
                .mockImplementation(((fn: () => Promise<void>) => { pendingCallback = fn(); return 0; }) as never);
            const schedule = CreateScheduleModel({ isPaused: true, cron: { pattern: '0 0 1 1 *', after: 10 } });

            await service.initSchedule(schedule);
            await schedulerRegistry.getCronJob(schedule._id).fireOnTick();
            await pendingCallback;

            expect(processService.execute).not.toHaveBeenCalled();
            setTimeoutSpy.mockRestore();
        });

        it('should execute the process once un-paused via setPaused, even though the cron job was already registered while paused', async () => {
            // regression : le callback enregistre par initSchedule capturait "process.schedule" par
            // reference, figee au moment de l'enregistrement. setPaused() ne reconstruit jamais ce
            // callback (il se contente de job.start()/job.stop() sur le CronJob deja enregistre) :
            // sans relecture a chaud de l'etat courant, ce depause restait invisible au callback et
            // le cycle ne demarrait jamais malgre isPaused=false en base (cas Group parent qui
            // demarre un enfant possedant un schedule).
            const cycle = CreateCycleModel({ _id: 'cycle-1' });
            configurationService.structure.cycles = [cycle];
            const schedule = CreateScheduleModel({ cycleId: 'cycle-1', isPaused: true, cron: { pattern: '0 0 1 1 *', after: 10 } });

            // initSchedule/setPaused tournent avec les vrais timers : le CronJob sous-jacent
            // (pattern annuel) recalcule sa prochaine echeance via job.start(), ce que le mock
            // synchrone de setTimeout ci-dessous ferait planter (cron/luxon rappelle recursivement
            // setTimeout pour fractionner un delai > MAXDELAY). On ne mocke qu'a partir d'ici, pour
            // ne capturer que le setTimeout(after) de notre propre callback applicatif.
            await service.initSchedule(schedule);
            await service.setPaused(schedule, false);

            let pendingCallback: Promise<void>;
            const setTimeoutSpy = jest.spyOn(global, 'setTimeout')
                .mockImplementation(((fn: () => Promise<void>) => { pendingCallback = fn(); return 0; }) as never);
            await schedulerRegistry.getCronJob(schedule._id).fireOnTick();
            await pendingCallback;

            expect(processService.execute).toHaveBeenCalledWith(expect.objectContaining({ cycle, action: ExecutableAction.ON }));
            setTimeoutSpy.mockRestore();
        });
    });

    describe('preapreScheduleProcess', () => {
        it('should build a process wired to the matching cycle', () => {
            const cycle = CreateCycleModel({ _id: 'cycle-1' });
            configurationService.structure.cycles = [cycle];
            const schedule = CreateScheduleModel({ cycleId: 'cycle-1' });

            const process = service.preapreScheduleProcess(schedule);

            expect(process.cycle).toBe(cycle);
            expect(process.action).toEqual(ExecutableAction.ON);
            expect(process.type).toEqual(ProcessType.INIT);
            expect(process.schedule).toBe(schedule);
        });

        it('should leave the cycle undefined when no cycle matches the schedule', () => {
            configurationService.structure.cycles = [];
            const schedule = CreateScheduleModel({ cycleId: 'missing-cycle' });

            const process = service.preapreScheduleProcess(schedule);

            expect(process.cycle).toBeUndefined();
        });
    });

    describe('restartAllSchedules', () => {
        it('should re-register a cron job for every tracked schedule', async () => {
            const cycle = await cycleRepository.save(CreateCycleModel({ name: 'Zone A' }));
            const schedule = CreateScheduleModel({ cycleId: cycle._id });
            configurationService.schedules = [schedule];

            await service.restartAllSchedules();

            expect(schedulerRegistry.doesExist('cron', schedule._id)).toBe(true);
        });

        it('should execute the restarted process once the cron tick and its internal delay complete', async () => {
            let pendingCallback: Promise<void>;
            const setTimeoutSpy = jest.spyOn(global, 'setTimeout')
                .mockImplementation(((fn: () => Promise<void>) => { pendingCallback = fn(); return 0; }) as never);
            const cycle = await cycleRepository.save(CreateCycleModel({ name: 'Zone A' }));
            const schedule = CreateScheduleModel({ cycleId: cycle._id, isPaused: false, cron: { pattern: '0 0 1 1 *', after: 10 } });
            configurationService.schedules = [schedule];

            await service.restartAllSchedules();
            await schedulerRegistry.getCronJob(schedule._id).fireOnTick();
            await pendingCallback;

            expect(processService.execute).toHaveBeenCalledWith(expect.objectContaining({ action: ExecutableAction.ON }));
            setTimeoutSpy.mockRestore();
        });

        it('should not execute the restarted process when the schedule is paused', async () => {
            let pendingCallback: Promise<void>;
            const setTimeoutSpy = jest.spyOn(global, 'setTimeout')
                .mockImplementation(((fn: () => Promise<void>) => { pendingCallback = fn(); return 0; }) as never);
            const cycle = await cycleRepository.save(CreateCycleModel({ name: 'Zone A' }));
            const schedule = CreateScheduleModel({ cycleId: cycle._id, isPaused: true, cron: { pattern: '0 0 1 1 *', after: 10 } });
            configurationService.schedules = [schedule];

            await service.restartAllSchedules();
            await schedulerRegistry.getCronJob(schedule._id).fireOnTick();
            await pendingCallback;

            expect(processService.execute).not.toHaveBeenCalled();
            setTimeoutSpy.mockRestore();
        });

        it('should execute the process (with a defined schedule field) once un-paused via setPaused after a restart while paused', async () => {
            // regression : (1) le callback de restartAllSchedules capturait "schedule" par
            // reference figee, jamais rafraichie par setPaused() (meme defaut que initSchedule) ;
            // (2) le ProcessModel construit ici n'assignait jamais process.schedule, ce qui faisait
            // planter _manageProcessMode ("Cannot read properties of undefined (reading
            // 'shouldConfirmation')") des qu'un conflit de priorite existait au moment du tick.
            const cycle = await cycleRepository.save(CreateCycleModel({ name: 'Zone A' }));
            const schedule = CreateScheduleModel({ cycleId: cycle._id, isPaused: true, cron: { pattern: '0 0 1 1 *', after: 10 } });
            configurationService.schedules = [schedule];

            // cf. commentaire equivalent dans le test initSchedule ci-dessus : ne mocker
            // setTimeout qu'apres restartAllSchedules/setPaused, pour ne pas interferer avec le
            // recalcul interne du CronJob (job.start()).
            await service.restartAllSchedules();
            await service.setPaused(schedule, false);

            let pendingCallback: Promise<void>;
            const setTimeoutSpy = jest.spyOn(global, 'setTimeout')
                .mockImplementation(((fn: () => Promise<void>) => { pendingCallback = fn(); return 0; }) as never);
            await schedulerRegistry.getCronJob(schedule._id).fireOnTick();
            await pendingCallback;

            expect(processService.execute).toHaveBeenCalledWith(expect.objectContaining({
                action: ExecutableAction.ON,
                schedule: expect.objectContaining({ _id: schedule._id, isPaused: false })
            }));
            setTimeoutSpy.mockRestore();
        });
    });

    describe('clearAllSchedules', () => {
        it('should remove jobs whose next date cannot be computed and keep the others', async () => {
            const expiredJob = new CronJob(new Date(Date.now() - 100000), jest.fn());
            schedulerRegistry.addCronJob('expired', expiredJob);
            const activeSchedule = CreateScheduleModel({ _id: 'still-active' });
            service.createSchedule(activeSchedule, jest.fn());

            await service.clearAllSchedules();

            expect(schedulerRegistry.doesExist('cron', 'expired')).toBe(false);
            expect(schedulerRegistry.doesExist('cron', 'still-active')).toBe(true);
        });
    });
});
