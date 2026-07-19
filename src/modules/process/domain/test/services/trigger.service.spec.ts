import { Test } from '@nestjs/testing';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { Connection } from 'mongoose';
import { TriggerService } from '@process/domain/services/trigger.service';
import { ScheduleService } from '@process/domain/services/schedule.service';
import { StructureService } from '@process/domain/services/configuration.service';
import { ProcessService } from '@process/domain/services/execution.service';
import { CycleRepository } from '@process/infrastructure/repositories/cycle.repository';
import { CycleMongooseRepository } from '@process/infrastructure/repositories/cycle-mongoose.repository';
import { SequenceMongooseRepository } from '@process/infrastructure/repositories/sequence-mongoose.repository';
import { ScheduleRepository } from '@process/infrastructure/repositories/schedule.repository';
import { ScheduleMongooseRepository } from '@process/infrastructure/repositories/schedule-mongoose.repository';
import { TriggerRepository } from '@process/infrastructure/repositories/trigger.repository';
import { TriggerMongooseRepository } from '@process/infrastructure/repositories/trigger-mongoose.repository';
import { Cycle, CycleSchema } from '@process/infrastructure/schemas/cycle.schema';
import { Sequence, SequenceSchema } from '@process/infrastructure/schemas/sequence.schema';
import { Schedule, ScheduleSchema } from '@process/infrastructure/schemas/schedule.schema';
import { Trigger, TriggerSchema } from '@process/infrastructure/schemas/trigger.schema';
import { TriggerModel } from '@process/domain/models/trigger.model';
import { ConditionModel } from '@process/domain/models/condition.model';
import { SensorValueModel } from '@process/domain/models/sensor-value.model';
import { ElementType } from '@process/domain/models/event.model';
import { SunState } from '@process/domain/interfaces/schedule.interface';
import { ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { StartMongoMemory, StopMongoMemory } from './mongo-memory.spec-mock';
import { CreateTriggerModel } from './trigger.spec-mock';

function CreateConditionModel(overrides: Partial<ConditionModel> = {}): ConditionModel {
    const condition = new ConditionModel();
    condition.name = 'condition';
    condition.elementId = 'sensor-1';
    condition.elementType = ElementType.SENSOR;
    condition.operator = '>';
    condition.value = 5;
    return Object.assign(condition, overrides);
}

function CreateSensorValue(overrides: Partial<SensorValueModel> = {}): SensorValueModel {
    const value = new SensorValueModel();
    value.id = 'sensor-1';
    value.value = 10;
    value.type = 'T';
    return Object.assign(value, overrides);
}

function CreateLoggerMock(): { log: jest.Mock; debug: jest.Mock; warn: jest.Mock; error: jest.Mock } {
    return { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

// generous par defaut : chaque check enchaine plusieurs aller-retours Mongo reels
// (trigger -> schedule -> cron), qui peuvent depasser 150ms quand la suite complete tourne
// sous forte charge (plusieurs mongodb-memory-server concurrents sur une machine a 4 coeurs).
function Flush(ms = 500): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('TriggerService', () => {
    let mongod: Awaited<ReturnType<typeof StartMongoMemory>>['mongod'];
    let connection: Connection;
    let schedulerRegistry: SchedulerRegistry;
    let cycleRepository: CycleRepository;
    let scheduleRepository: ScheduleRepository;
    let triggerRepository: TriggerRepository;
    let scheduleService: ScheduleService;
    let configurationService: { triggers: TriggerModel[]; schedules: unknown[]; structure: { cycles: unknown[] } };
    let valueRepository: { getDeviceValue: jest.Mock };
    let eventRepository: { save: jest.Mock };
    let sensorRepository: Record<string, never>;
    let processService: { execute: jest.Mock };
    let logger: ReturnType<typeof CreateLoggerMock>;
    let service: TriggerService;

    beforeAll(async () => {
        ({ mongod, connection } = await StartMongoMemory());

        const cycleModel = connection.model(Cycle.name, CycleSchema);
        const sequenceModel = connection.model(Sequence.name, SequenceSchema);
        const scheduleModel = connection.model(Schedule.name, ScheduleSchema);
        const triggerModel = connection.model(Trigger.name, TriggerSchema);

        const sequenceMongooseRepository = new SequenceMongooseRepository(sequenceModel as never);
        const scheduleMongooseRepository = new ScheduleMongooseRepository(scheduleModel as never);
        const triggerMongooseRepository = new TriggerMongooseRepository(triggerModel as never);
        scheduleRepository = new ScheduleRepository(scheduleMongooseRepository);
        triggerRepository = new TriggerRepository(triggerMongooseRepository);
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
        for (const name of schedulerRegistry.getCronJobs().keys()) {
            schedulerRegistry.deleteCronJob(name);
        }
        await StopMongoMemory(mongod, connection);
    });

    beforeEach(async () => {
        await connection.collection('schedules').deleteMany({});
        await connection.collection('triggers').deleteMany({});
        for (const name of schedulerRegistry.getCronJobs().keys()) {
            schedulerRegistry.deleteCronJob(name);
        }

        configurationService = { triggers: [], schedules: [], structure: { cycles: [] } };
        valueRepository = { getDeviceValue: jest.fn() };
        eventRepository = { save: jest.fn().mockResolvedValue(undefined) };
        sensorRepository = {};
        logger = CreateLoggerMock();

        processService = { execute: jest.fn().mockResolvedValue(undefined) };
        scheduleService = new ScheduleService(
            schedulerRegistry,
            configurationService as unknown as StructureService,
            processService as unknown as ProcessService,
            cycleRepository,
            scheduleRepository,
            logger as never
        );

        service = new TriggerService(
            configurationService as unknown as StructureService,
            scheduleService,
            triggerRepository,
            scheduleRepository,
            sensorRepository as never,
            eventRepository as never,
            valueRepository as never,
            processService as unknown as ProcessService,
            logger as never
        );
    });

    describe('initTrigger', () => {
        it('should track a newly created trigger', async () => {
            const trigger = CreateTriggerModel();

            await service.initTrigger(trigger, false);

            expect(service.triggers).toContainEqual(trigger);
        });

        it('should remove a tracked trigger when deleted', async () => {
            const trigger = CreateTriggerModel();
            await service.initTrigger(trigger, false);

            await service.initTrigger(trigger, true);

            expect(service.triggers).not.toContainEqual(trigger);
        });

        it('should update the matching tracked trigger by id, not always the first one', async () => {
            const first = CreateTriggerModel({ id: 'trigger-a', name: 'first' });
            const second = CreateTriggerModel({ id: 'trigger-b', name: 'second' });
            await service.initTrigger(first, false);
            await service.initTrigger(second, false);

            const updatedSecond = CreateTriggerModel({ id: 'trigger-b', name: 'second-renamed' });
            await service.initTrigger(updatedSecond, false);

            expect(service.triggers.find((t) => t.id === 'trigger-a').name).toEqual('first');
            expect(service.triggers.find((t) => t.id === 'trigger-b').name).toEqual('second-renamed');
        });

        it('should not track anything when deleting a trigger id that is not tracked', async () => {
            await service.initTrigger(CreateTriggerModel({ id: 'ghost' }), true);

            expect(service.triggers).toHaveLength(0);
        });

        it('should default isDeleted to false when omitted', async () => {
            const trigger = CreateTriggerModel();

            await service.initTrigger(trigger);

            expect(service.triggers).toContainEqual(trigger);
        });
    });

    describe('setPaused', () => {
        it('should return the same trigger without saving when isPaused already matches', async () => {
            const trigger = CreateTriggerModel({ isPaused: false });
            const saveSpy = jest.spyOn(triggerRepository, 'save');

            const result = await service.setPaused(trigger, false);

            expect(result).toBe(trigger);
            expect(saveSpy).not.toHaveBeenCalled();
            saveSpy.mockRestore();
        });

        it('should save and return the updated trigger when isPaused differs', async () => {
            const trigger = CreateTriggerModel({ isPaused: false });

            const result = await service.setPaused(trigger, true);

            expect(result.isPaused).toBe(true);
        });

        it('should replace the tracked entry in service.triggers when the trigger is tracked', async () => {
            const trigger = CreateTriggerModel({ isPaused: false });
            await service.initTrigger(trigger, false);

            const result = await service.setPaused(trigger, true);

            expect(service.triggers.find((t) => t.id === trigger.id)).toEqual(result);
        });

        it('should not throw when the trigger is not tracked in service.triggers', async () => {
            const trigger = CreateTriggerModel({ isPaused: false });

            await expect(service.setPaused(trigger, true)).resolves.toEqual(expect.objectContaining({ isPaused: true }));
            expect(service.triggers).toHaveLength(0);
        });
    });

    describe('reactive condition check (via onElementValueChanged)', () => {
        it('should schedule execution when a matching condition is verified', async () => {
            const trigger = CreateTriggerModel({ conditions: [CreateConditionModel({ elementId: 'sensor-1', operator: '>', value: 5 })] });
            configurationService.triggers = [trigger];
            service.initilize();
            valueRepository.getDeviceValue.mockResolvedValue(CreateSensorValue({ value: 10 }));

            service.onElementValueChanged.next(CreateSensorValue({ value: 10 }));
            await Flush();

            expect(eventRepository.save).toHaveBeenCalledWith(expect.objectContaining({ elementType: 'SENSOR' }));
            expect(schedulerRegistry.getCronJobs().size).toEqual(1);
        });

        it('should execute the planified process and re-open the trigger for checking once the cron tick fires', async () => {
            const trigger = CreateTriggerModel({ conditions: [CreateConditionModel({ elementId: 'sensor-1', operator: '>', value: 5 })] });
            configurationService.triggers = [trigger];
            service.initilize();
            valueRepository.getDeviceValue.mockResolvedValue(CreateSensorValue({ value: 10 }));

            service.onElementValueChanged.next(CreateSensorValue({ value: 10 }));
            await Flush();
            const plannedJob = [...schedulerRegistry.getCronJobs().values()][0];
            await plannedJob.fireOnTick();
            await Flush();

            expect(processService.execute).toHaveBeenCalledWith(expect.objectContaining({ action: trigger.action }));
            const trackedTrigger = service.triggers.find((x) => x.id === trigger.id);
            expect(trackedTrigger.isCheckInProgress).toBe(false);
        });

        it('should not schedule execution when the condition is not verified', async () => {
            const trigger = CreateTriggerModel({ conditions: [CreateConditionModel({ elementId: 'sensor-1', operator: '>', value: 5 })] });
            configurationService.triggers = [trigger];
            service.initilize();
            valueRepository.getDeviceValue.mockResolvedValue(CreateSensorValue({ value: 2 }));

            service.onElementValueChanged.next(CreateSensorValue({ value: 2 }));
            await Flush();

            expect(schedulerRegistry.getCronJobs().size).toEqual(0);
        });

        it('should ignore values that do not match any tracked trigger condition', async () => {
            const trigger = CreateTriggerModel({ conditions: [CreateConditionModel({ elementId: 'sensor-1' })] });
            configurationService.triggers = [trigger];
            service.initilize();

            service.onElementValueChanged.next(CreateSensorValue({ id: 'unrelated-sensor' }));
            await Flush();

            expect(valueRepository.getDeviceValue).not.toHaveBeenCalled();
        });

        it('should skip a paused trigger', async () => {
            const trigger = CreateTriggerModel({
                isPaused: true,
                conditions: [CreateConditionModel({ elementId: 'sensor-1', operator: '>', value: 5 })]
            });
            configurationService.triggers = [trigger];
            service.initilize();
            valueRepository.getDeviceValue.mockResolvedValue(CreateSensorValue({ value: 10 }));

            service.onElementValueChanged.next(CreateSensorValue({ value: 10 }));
            await Flush();

            expect(valueRepository.getDeviceValue).not.toHaveBeenCalled();
        });

        it('should skip a trigger whose delay has not elapsed since its last execution', async () => {
            const trigger = CreateTriggerModel({
                lastTriggeredAt: new Date(),
                delay: 1000 * 60 * 60,
                conditions: [CreateConditionModel({ elementId: 'sensor-1', operator: '>', value: 5 })]
            });
            configurationService.triggers = [trigger];
            service.initilize();
            valueRepository.getDeviceValue.mockResolvedValue(CreateSensorValue({ value: 10 }));

            service.onElementValueChanged.next(CreateSensorValue({ value: 10 }));
            await Flush();

            expect(valueRepository.getDeviceValue).not.toHaveBeenCalled();
        });

        it('should queue a check instead of re-running it when one is already in progress for that trigger', async () => {
            const trigger = CreateTriggerModel({
                isCheckInProgress: true,
                conditions: [CreateConditionModel({ elementId: 'sensor-1', operator: '>', value: 5 })]
            });
            configurationService.triggers = [trigger];
            service.initilize();

            service.onElementValueChanged.next(CreateSensorValue({ value: 10 }));
            await Flush();

            expect(service.triggerCheckQueue).toContainEqual(expect.objectContaining({ trigger }));
            expect(valueRepository.getDeviceValue).not.toHaveBeenCalled();
        });

        it('should re-run a queued check with its own queued data once the in-progress check completes', async () => {
            const trigger = CreateTriggerModel({ conditions: [CreateConditionModel({ elementId: 'sensor-1', operator: '>', value: 5 })] });
            configurationService.triggers = [trigger];
            service.initilize();
            let resolveFirstCheck: (v: SensorValueModel) => void;
            const firstCheckValue = new Promise<SensorValueModel>((resolve) => { resolveFirstCheck = resolve; });
            valueRepository.getDeviceValue.mockReturnValueOnce(firstCheckValue).mockResolvedValue(CreateSensorValue({ value: 2 }));

            service.onElementValueChanged.next(CreateSensorValue({ value: 10 }));
            await Flush(100);
            expect(trigger.isCheckInProgress).toBe(true);

            service.onElementValueChanged.next(CreateSensorValue({ value: 2 }));
            await Flush(100);
            expect(service.triggerCheckQueue).toContainEqual(expect.objectContaining({ trigger }));

            // le trigger est deja en queue : un troisieme declenchement pendant que le check est
            // toujours en cours doit trouver l'entree existante (find() non vide) et ne pas la dupliquer.
            service.onElementValueChanged.next(CreateSensorValue({ value: 2 }));
            await Flush(100);
            expect(service.triggerCheckQueue.filter((x) => x.trigger === trigger)).toHaveLength(1);

            resolveFirstCheck(CreateSensorValue({ value: 2 }));
            await Flush();

            expect(valueRepository.getDeviceValue).toHaveBeenCalledTimes(2);
            expect(service.triggerCheckQueue).not.toContainEqual(expect.objectContaining({ trigger }));
            expect(trigger.isCheckInProgress).toBe(false);
        });

        it('should tag a persisted event as a CYCLE element when the incoming value has no numeric `value` field', async () => {
            // isPaused=true coupe le pipeline juste apres la sauvegarde de la valeur entrante :
            // suffisant pour isoler cette assertion de l'evaluation mathjs des conditions,
            // hors-perimetre de ce test.
            const trigger = CreateTriggerModel({ isPaused: true, conditions: [CreateConditionModel({ elementId: 'process-1' })] });
            configurationService.triggers = [trigger];
            service.initilize();

            service.onElementValueChanged.next({ id: 'process-1', type: 'CYCLE', status: 'IN_PROCCESS' } as never);
            await Flush();

            expect(eventRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    elementId: 'process-1',
                    elementType: 'CYCLE',
                    additionalData: expect.objectContaining({ type: 'sensor', value: 'IN_PROCCESS' })
                })
            );
        });

        it('should tag a persisted event as a SEQUENCE element when the process value type is SEQUENCE', async () => {
            const trigger = CreateTriggerModel({ isPaused: true, conditions: [CreateConditionModel({ elementId: 'seq-1' })] });
            configurationService.triggers = [trigger];
            service.initilize();

            service.onElementValueChanged.next({ id: 'seq-1', type: 'SEQUENCE', status: 'IN_PROCCESS' } as never);
            await Flush();

            expect(eventRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({ elementId: 'seq-1', elementType: 'SEQUENCE' })
            );
        });

        it('should tolerate an undefined sensor value when saving the sensor event', async () => {
            const trigger = CreateTriggerModel({ isPaused: true, conditions: [CreateConditionModel({ elementId: 'sensor-1' })] });
            configurationService.triggers = [trigger];
            service.initilize();

            service.onElementValueChanged.next({ id: 'sensor-1', value: undefined } as never);
            await Flush();

            expect(eventRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({ elementType: 'SENSOR', additionalData: { value: undefined } })
            );
        });

        it('should tolerate an undefined status when saving a CYCLE/SEQUENCE event', async () => {
            const trigger = CreateTriggerModel({ isPaused: true, conditions: [CreateConditionModel({ elementId: 'process-1' })] });
            configurationService.triggers = [trigger];
            service.initilize();

            service.onElementValueChanged.next({ id: 'process-1', type: 'CYCLE', status: undefined } as never);
            await Flush();

            expect(eventRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({ elementType: 'CYCLE', additionalData: { type: 'sensor', value: undefined } })
            );
        });

        it('should allow re-checking once the configured delay has elapsed since lastTriggeredAt', async () => {
            const trigger = CreateTriggerModel({
                lastTriggeredAt: new Date(Date.now() - 2000),
                delay: 1000,
                conditions: [CreateConditionModel({ elementId: 'sensor-1', operator: '>', value: 5 })]
            });
            configurationService.triggers = [trigger];
            service.initilize();
            valueRepository.getDeviceValue.mockResolvedValue(CreateSensorValue({ value: 10 }));

            service.onElementValueChanged.next(CreateSensorValue({ value: 10 }));
            await Flush();

            expect(valueRepository.getDeviceValue).toHaveBeenCalled();
        });

        it('should still allow checking when trigger.delay is falsy (0)', async () => {
            const trigger = CreateTriggerModel({
                lastTriggeredAt: new Date(Date.now() - 100000),
                delay: 0,
                conditions: [CreateConditionModel({ elementId: 'sensor-1', operator: '>', value: 5 })]
            });
            configurationService.triggers = [trigger];
            service.initilize();
            valueRepository.getDeviceValue.mockResolvedValue(CreateSensorValue({ value: 10 }));

            service.onElementValueChanged.next(CreateSensorValue({ value: 10 }));
            await Flush();

            expect(valueRepository.getDeviceValue).toHaveBeenCalled();
        });

        it('should allow checking regardless of recency when trigger.delay is undefined (NaN falls back to 0)', async () => {
            const trigger = CreateTriggerModel({
                lastTriggeredAt: new Date(),
                delay: undefined,
                conditions: [CreateConditionModel({ elementId: 'sensor-1', operator: '>', value: 5 })]
            });
            configurationService.triggers = [trigger];
            service.initilize();
            valueRepository.getDeviceValue.mockResolvedValue(CreateSensorValue({ value: 10 }));

            service.onElementValueChanged.next(CreateSensorValue({ value: 10 }));
            await Flush();

            expect(valueRepository.getDeviceValue).toHaveBeenCalled();
        });

        it('should not verify the condition when the device value resolves to undefined', async () => {
            const trigger = CreateTriggerModel({ conditions: [CreateConditionModel({ elementId: 'sensor-1', operator: '>', value: 5 })] });
            configurationService.triggers = [trigger];
            service.initilize();
            valueRepository.getDeviceValue.mockResolvedValue(undefined);

            service.onElementValueChanged.next(CreateSensorValue({ value: 10 }));
            await Flush();

            expect(schedulerRegistry.getCronJobs().size).toEqual(0);
        });

        it('should read `.status` instead of `.value` for a non-SENSOR condition element type', async () => {
            const trigger = CreateTriggerModel({
                conditions: [CreateConditionModel({ elementId: 'cycle-x', elementType: ElementType.CYCLE, operator: '==', value: 1 })]
            });
            configurationService.triggers = [trigger];
            service.initilize();
            valueRepository.getDeviceValue.mockResolvedValue({ status: 1 } as never);

            service.onElementValueChanged.next({ id: 'cycle-x', value: 10 } as never);
            await Flush();

            expect(schedulerRegistry.getCronJobs().size).toEqual(1);
        });

        it('should compare a STOPPED status as 0 for a non-SENSOR condition element type', async () => {
            const trigger = CreateTriggerModel({
                conditions: [CreateConditionModel({ elementId: 'cycle-x', elementType: ElementType.CYCLE, operator: '==', value: 0 })]
            });
            configurationService.triggers = [trigger];
            service.initilize();
            valueRepository.getDeviceValue.mockResolvedValue({ status: ExecutableStatus.STOPPED } as never);

            service.onElementValueChanged.next({ id: 'cycle-x', value: 10 } as never);
            await Flush();

            expect(schedulerRegistry.getCronJobs().size).toEqual(1);
        });

        it('should not verify the condition when the extracted value itself is undefined', async () => {
            const trigger = CreateTriggerModel({ conditions: [CreateConditionModel({ elementId: 'sensor-1', operator: '>', value: 5 })] });
            configurationService.triggers = [trigger];
            service.initilize();
            valueRepository.getDeviceValue.mockResolvedValue({ value: undefined } as never);

            service.onElementValueChanged.next(CreateSensorValue({ value: 10 }));
            await Flush();

            expect(schedulerRegistry.getCronJobs().size).toEqual(0);
        });

        it('should compute the execution time from sunset when sunBehavior.sunState is SUNRISE', async () => {
            const trigger = CreateTriggerModel({
                trigger: { sunBehavior: { sunState: SunState.SUNRISE, time: 0 } },
                conditions: [CreateConditionModel({ elementId: 'sensor-1', operator: '>', value: 5 })]
            });
            configurationService.triggers = [trigger];
            service.initilize();
            valueRepository.getDeviceValue.mockResolvedValue(CreateSensorValue({ value: 10 }));

            service.onElementValueChanged.next(CreateSensorValue({ value: 10 }));
            await Flush();

            expect(schedulerRegistry.getCronJobs().size).toEqual(1);
        });

        it('should compute the execution time from sunrise when sunBehavior.sunState is not SUNRISE', async () => {
            const trigger = CreateTriggerModel({
                trigger: { sunBehavior: { sunState: SunState.SUNSET, time: 0 } },
                conditions: [CreateConditionModel({ elementId: 'sensor-1', operator: '>', value: 5 })]
            });
            configurationService.triggers = [trigger];
            service.initilize();
            valueRepository.getDeviceValue.mockResolvedValue(CreateSensorValue({ value: 10 }));

            service.onElementValueChanged.next(CreateSensorValue({ value: 10 }));
            await Flush();

            expect(schedulerRegistry.getCronJobs().size).toEqual(1);
        });
    });
});
