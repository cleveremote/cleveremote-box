import { Test } from '@nestjs/testing';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { Connection } from 'mongoose';
import { SynchronizeService } from '@process/domain/services/synchronize.service';
import { ScheduleService } from '@process/domain/services/schedule.service';
import { GlobalSettingsService } from '@process/domain/services/global-settings.service';
import { StructureService } from '@process/domain/services/configuration.service';
import { TriggerService } from '@process/domain/services/trigger.service';
import { SensorService } from '@process/domain/services/sensor.service';
import { ProcessService } from '@process/domain/services/execution.service';
import { CycleRepository } from '@process/infrastructure/repositories/cycle.repository';
import { CycleMongooseRepository } from '@process/infrastructure/repositories/cycle-mongoose.repository';
import { SequenceRepository } from '@process/infrastructure/repositories/sequence.repository';
import { SequenceMongooseRepository } from '@process/infrastructure/repositories/sequence-mongoose.repository';
import { ScheduleRepository } from '@process/infrastructure/repositories/schedule.repository';
import { ScheduleMongooseRepository } from '@process/infrastructure/repositories/schedule-mongoose.repository';
import { TriggerRepository } from '@process/infrastructure/repositories/trigger.repository';
import { TriggerMongooseRepository } from '@process/infrastructure/repositories/trigger-mongoose.repository';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { DeviceMongooseRepository } from '@process/infrastructure/repositories/device-mongoose.repository';
import { ActuatorRepository } from '@process/infrastructure/repositories/actuator.repository';
import { ActuatorMongooseRepository } from '@process/infrastructure/repositories/actuator-mongoose.repository';
import { Cycle, CycleSchema } from '@process/infrastructure/schemas/cycle.schema';
import { Sequence, SequenceSchema } from '@process/infrastructure/schemas/sequence.schema';
import { Schedule, ScheduleSchema } from '@process/infrastructure/schemas/schedule.schema';
import { Trigger, TriggerSchema } from '@process/infrastructure/schemas/trigger.schema';
import { Device, DeviceSchema } from '@process/infrastructure/schemas/device.schema';
import {
    SynchronizeActuatorModel,
    SynchronizeComRequestModel,
    SynchronizeCycleModel,
    SynchronizeDeviceModel,
    SynchronizeScheduleModel,
    SynchronizeSensorModel,
    SynchronizeSequenceModel,
    SynchronizeTriggerModel
} from '@process/domain/models/synchronize.model';
import { ActuatorModel, CtrlActuatorConfigModel } from '@process/domain/models/actuator.model';
import { DeviceModel, DeviceType, MasterConfigModel, MasterProtocol, SlaveConfigModel } from '@process/domain/models/device.model';
import { ComRequestModel, ModbusFunctionName } from '@process/domain/models/com-request.model';
import { ScheduleModel } from '@process/domain/models/schedule.model';
import { SensorModel } from '@process/domain/models/sensor.model';
import { StructureModel } from '@process/domain/models/structure.model';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { StartMongoMemory, StopMongoMemory } from './mongo-memory.spec-mock';
import { CreateCycleModel } from './cycle.spec-mock';
import { CreateActuatorRpiModel, CreateActuatorComModel, CreateActuatorMongooseModels } from './actuator.spec-mock';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { CreateScheduleModel } from './schedule.spec-mock';
import { CreateTriggerModel } from './trigger.spec-mock';

function CreateMasterDeviceModel(overrides: Partial<MasterConfigModel> = {}): DeviceModel {
    const device = new DeviceModel();
    device.name = 'master';
    device.type = DeviceType.MASTER;
    const config = new MasterConfigModel();
    config.protocol = MasterProtocol.TCP;
    config.ipAddress = '192.0.2.1';
    config.port = 502;
    config.timeout = 2000;
    device.config = Object.assign(config, overrides);
    return device;
}

function CreateSlaveDeviceModel(overrides: Partial<SlaveConfigModel> = {}): DeviceModel {
    const device = new DeviceModel();
    device.name = 'slave';
    device.type = DeviceType.SLAVE;
    const config = new SlaveConfigModel();
    config.slaveId = 1;
    device.config = Object.assign(config, overrides);
    return device;
}

function CreateValveModel(overrides: Partial<ActuatorModel> = {}): ActuatorModel {
    const valve = new ActuatorModel();
    valve.name = 'valve';
    valve.type = ActuatorType.CTRL;
    valve.status = ModuleStatus.OFF;
    valve.config = Object.assign(new CtrlActuatorConfigModel(), {
        deviceId: 'connection-1', channel: 1, flowMeterId: 'flow-1', maxFlowRate: 100,
        kP: 5, minOpening: 0, maxOpening: 100, openingPercent: 0, tolerance: 1, maxIterations: 20, iterationDelayMs: 500,
        valveType: 'PROPORTIONAL'
    });
    return Object.assign(valve, overrides);
}

function CreateLoggerMock(): { log: jest.Mock; debug: jest.Mock; warn: jest.Mock; error: jest.Mock } {
    return { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function CreateReplaceAllRepositoryMock(): { replaceAll: jest.Mock; save: jest.Mock; saveMany: jest.Mock; delete: jest.Mock; get: jest.Mock; replaceForDevice: jest.Mock } {
    return {
        replaceAll: jest.fn((models: unknown[]) => Promise.resolve(models)),
        save: jest.fn((model: unknown) => Promise.resolve(model)),
        saveMany: jest.fn((models: unknown[]) => Promise.resolve(models)),
        delete: jest.fn().mockResolvedValue(true),
        get: jest.fn().mockResolvedValue([]),
        replaceForDevice: jest.fn().mockResolvedValue([])
    };
}

describe('SynchronizeService (integration mongodb-memory-server for cycle/valve/actuator/modbus-connection)', () => {
    let mongod: Awaited<ReturnType<typeof StartMongoMemory>>['mongod'];
    let connection: Connection;
    let schedulerRegistry: SchedulerRegistry;
    let cycleRepository: CycleRepository;
    let sequenceRepository: SequenceRepository;
    let scheduleRepository: ScheduleRepository;
    let triggerRepository: TriggerRepository;
    let deviceRepository: DeviceRepository;
    let actuatorRepository: ActuatorRepository;
    let scheduleService: ScheduleService;
    let configurationService: { getStructure: jest.Mock; structure: StructureModel; schedules: ScheduleModel[] };
    let triggerService: { initTrigger: jest.Mock };
    let sensorService: { initScheduledSensor: jest.Mock };
    let sensorRepository: ReturnType<typeof CreateReplaceAllRepositoryMock>;
    let modbusTaskRepository: ReturnType<typeof CreateReplaceAllRepositoryMock>;
    let logger: ReturnType<typeof CreateLoggerMock>;
    let service: SynchronizeService;

    beforeAll(async () => {
        ({ mongod, connection } = await StartMongoMemory());

        const cycleModel = connection.model(Cycle.name, CycleSchema);
        const sequenceModel = connection.model(Sequence.name, SequenceSchema);
        const scheduleModel = connection.model(Schedule.name, ScheduleSchema);
        const triggerModel = connection.model(Trigger.name, TriggerSchema);
        const deviceModel = connection.model(Device.name, DeviceSchema);
        const { actuatorModel, actuatorRpiModel, actuatorComModel, actuatorCtrlModel } = CreateActuatorMongooseModels(connection);

        const sequenceMongooseRepository = new SequenceMongooseRepository(sequenceModel as never);
        const scheduleMongooseRepository = new ScheduleMongooseRepository(scheduleModel as never);
        const triggerMongooseRepository = new TriggerMongooseRepository(triggerModel as never);
        actuatorRepository = new ActuatorRepository(new ActuatorMongooseRepository(
            actuatorModel as never, actuatorRpiModel as never, actuatorComModel as never, actuatorCtrlModel as never,
            connection, CreateLoggerMock() as never
        ));
        sequenceRepository = new SequenceRepository(sequenceMongooseRepository);
        scheduleRepository = new ScheduleRepository(scheduleMongooseRepository);
        triggerRepository = new TriggerRepository(triggerMongooseRepository);
        cycleRepository = new CycleRepository(
            new CycleMongooseRepository(cycleModel as never, sequenceMongooseRepository, scheduleMongooseRepository, triggerMongooseRepository),
            sequenceRepository,
            scheduleRepository,
            triggerRepository
        );
        deviceRepository = new DeviceRepository(new DeviceMongooseRepository(deviceModel as never));

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
        for (const collectionName of ['cycles', 'sequences', 'schedules', 'triggers', 'devices', 'actuators']) {
            await connection.collection(collectionName).deleteMany({});
        }
        for (const name of schedulerRegistry.getCronJobs().keys()) {
            schedulerRegistry.deleteCronJob(name);
        }

        configurationService = {
            getStructure: jest.fn().mockResolvedValue(undefined),
            structure: new StructureModel(),
            schedules: []
        };
        // TriggerService/SensorService touchent des ressources hors-perimetre de ce test
        // (serie/BLE/websocket pour SensorService) : on ne verifie ici que la delegation.
        triggerService = { initTrigger: jest.fn((trigger: unknown) => Promise.resolve(trigger)) };
        sensorService = { initScheduledSensor: jest.fn((sensor: unknown) => Promise.resolve(sensor)) };
        sensorRepository = CreateReplaceAllRepositoryMock();
        modbusTaskRepository = CreateReplaceAllRepositoryMock();
        logger = CreateLoggerMock();

        const processService = { execute: jest.fn().mockResolvedValue(undefined) };
        const globalSettingsService = { localCoordinates: undefined };
        scheduleService = new ScheduleService(
            schedulerRegistry,
            configurationService as unknown as StructureService,
            processService as unknown as ProcessService,
            cycleRepository,
            scheduleRepository,
            globalSettingsService as unknown as GlobalSettingsService,
            logger as never
        );

        service = new SynchronizeService(
            deviceRepository,
            modbusTaskRepository as never,
            cycleRepository,
            sequenceRepository,
            triggerRepository,
            scheduleRepository,
            sensorRepository as never,
            actuatorRepository,
            configurationService as unknown as StructureService,
            scheduleService,
            triggerService as unknown as TriggerService,
            sensorService as unknown as SensorService,
            logger as never
        );
    });

    describe('synchronizeCycle', () => {
        it('should create a cycle with its nested sequence, module, schedule and trigger', async () => {
            const actuatorRpi = await actuatorRepository.save(CreateActuatorRpiModel());
            const sequence = new SynchronizeSequenceModel();
            sequence.name = 'sequence';
            sequence.securityConfig.maxDuration = 1000;
            sequence.moduleConfigs = [{
                moduleId: actuatorRpi._id,
                configTiming: { waitBeforeExec: 0, waitAfterExec: 0, waitBeforeExecOff: 0, waitAfterExecOff: 0 }
            }];

            const cycleModel = new SynchronizeCycleModel();
            Object.assign(cycleModel, CreateCycleModel({ name: 'Zone A' }));
            cycleModel.sequences = [sequence];
            cycleModel.schedules = [CreateScheduleModel({ _id: undefined })];
            cycleModel.triggers = [CreateTriggerModel({ id: undefined })];

            const result = await service.synchronizeCycle(cycleModel);

            expect(result._id).toBeDefined();
            expect(result.sequences).toHaveLength(1);
            expect(result.sequences[0].moduleConfigs).toHaveLength(1);
            expect(result.schedules).toHaveLength(1);
            expect(result.triggers).toHaveLength(1);
            expect(configurationService.getStructure).toHaveBeenCalled();
            expect(schedulerRegistry.doesExist('cron', result.schedules[0]._id)).toBe(true);
        });

        it('should update an existing cycle', async () => {
            const created = await cycleRepository.save(Object.assign(new SynchronizeCycleModel(), CreateCycleModel({ name: 'Zone A' })));
            const updateModel = new SynchronizeCycleModel();
            Object.assign(updateModel, CreateCycleModel({ _id: created._id, name: 'Zone A renamed' }));

            const result = await service.synchronizeCycle(updateModel);

            expect(result.name).toEqual('Zone A renamed');
        });

        it('should soft delete a cycle via synchronizeCycle({ delete: true }), cascading to its sequences', async () => {
            const sequence = new SynchronizeSequenceModel();
            sequence.name = 'sequence';
            sequence.securityConfig.maxDuration = 1000;

            const cycleModel = new SynchronizeCycleModel();
            Object.assign(cycleModel, CreateCycleModel({ name: 'Zone A' }));
            cycleModel.sequences = [sequence];
            const created = await service.synchronizeCycle(cycleModel);

            const deleteModel = new SynchronizeCycleModel();
            deleteModel._id = created._id;
            deleteModel.delete = true;
            const result = await service.synchronizeCycle(deleteModel);

            expect(result.deletedAt).toBeDefined();
            expect(await cycleRepository.get(created._id)).toBeNull();
            expect(await sequenceRepository.findByCycleId(created._id)).toHaveLength(0);
        });

        it('should soft delete only the sequence flagged delete:true, keeping siblings and leaving absent ones untouched', async () => {
            const keep = new SynchronizeSequenceModel();
            keep.name = 'keep';
            keep.securityConfig.maxDuration = 1000;
            const toRemove = new SynchronizeSequenceModel();
            toRemove.name = 'to-remove';
            toRemove.securityConfig.maxDuration = 1000;
            const untouched = new SynchronizeSequenceModel();
            untouched.name = 'untouched';
            untouched.securityConfig.maxDuration = 1000;

            const cycleModel = new SynchronizeCycleModel();
            Object.assign(cycleModel, CreateCycleModel({ name: 'Zone A' }));
            cycleModel.sequences = [keep, toRemove, untouched];
            const created = await service.synchronizeCycle(cycleModel);
            const [keepId, toRemoveId, untouchedId] = created.sequences.map((s) => s._id);

            // deuxieme synchro : `untouched` est absente du payload (ne doit plus etre supprimee
            // par omission), `toRemove` est explicitement marquee `delete: true`.
            const keepAgain = new SynchronizeSequenceModel();
            keepAgain._id = keepId;
            keepAgain.name = 'keep';
            keepAgain.securityConfig.maxDuration = 1000;
            const removeAgain = new SynchronizeSequenceModel();
            removeAgain._id = toRemoveId;
            removeAgain.delete = true;

            const resyncModel = new SynchronizeCycleModel();
            resyncModel._id = created._id;
            Object.assign(resyncModel, CreateCycleModel({ _id: created._id, name: 'Zone A' }));
            resyncModel.sequences = [keepAgain, removeAgain];
            await service.synchronizeCycle(resyncModel);

            expect(await sequenceRepository.get(keepId)).not.toBeNull();
            expect(await sequenceRepository.get(toRemoveId)).toBeNull();
            expect(await sequenceRepository.get(untouchedId)).not.toBeNull();
        });

        it('should fall back to an empty array when sequences/schedules/triggers are explicitly undefined', async () => {
            const cycleModel = new SynchronizeCycleModel();
            Object.assign(cycleModel, CreateCycleModel({ name: 'Zone A' }));
            cycleModel.sequences = undefined;
            cycleModel.schedules = undefined;
            cycleModel.triggers = undefined;

            const result = await service.synchronizeCycle(cycleModel);

            expect(result.sequences).toEqual([]);
            expect(result.schedules).toEqual([]);
            expect(result.triggers).toEqual([]);
        });
    });

    describe('synchronizeValve', () => {
        it('should create a valve', async () => {
            const result = await service.synchronizeValve(CreateValveModel({ name: 'Valve A' }));

            expect(result._id).toBeDefined();
            expect(configurationService.getStructure).toHaveBeenCalled();
        });

        it('should soft delete a valve via synchronizeValve({ delete: true })', async () => {
            const created = await actuatorRepository.save(CreateValveModel({ name: 'Valve A' }));

            const deleteModel = new SynchronizeActuatorModel();
            deleteModel._id = created._id;
            deleteModel.delete = true;
            const result = await service.synchronizeValve(deleteModel);

            expect(result.deletedAt).toBeDefined();
            expect(await actuatorRepository.get(created._id)).toBeNull();
        });
    });

    describe('synchronizeActuatorList / deleteActuatorList', () => {
        it('should create a list of actuators (rpi and com)', async () => {
            const [rpi, com] = await service.synchronizeActuatorList([CreateActuatorRpiModel(), CreateActuatorComModel()]);

            expect(rpi._id).toBeDefined();
            expect(rpi.type).toEqual(ActuatorType.RPI);
            expect(com._id).toBeDefined();
            expect(com.type).toEqual(ActuatorType.COM);
        });

        it('should soft delete only actuators flagged delete:true, leaving absent ones untouched', async () => {
            const toRemove = await actuatorRepository.save(CreateActuatorRpiModel());
            const untouched = await actuatorRepository.save(CreateActuatorComModel());

            const deleteModel = new SynchronizeActuatorModel();
            deleteModel._id = toRemove._id;
            deleteModel.delete = true;
            await service.synchronizeActuatorList([deleteModel]);

            expect(await actuatorRepository.findByIds([toRemove._id])).toHaveLength(0);
            expect(await actuatorRepository.findByIds([untouched._id])).toHaveLength(1);
        });
    });

    describe('synchronizeDeviceList / synchronizeModbusTaskList', () => {
        it('should create a list of devices', async () => {
            const result = await service.synchronizeDeviceList([CreateMasterDeviceModel()]);

            expect(result[0]._id).toBeDefined();
            expect(configurationService.getStructure).toHaveBeenCalled();
        });

        it('should soft delete a device via synchronizeDeviceList({ delete: true })', async () => {
            const created = await deviceRepository.save(CreateMasterDeviceModel());

            const deleteModel = new SynchronizeDeviceModel();
            deleteModel._id = created._id;
            deleteModel.delete = true;
            await service.synchronizeDeviceList([deleteModel]);

            expect(await deviceRepository.get(created._id)).toBeNull();
        });

        it('should delegate modbus task list save to the repository', async () => {
            const modbusTask = new ComRequestModel();
            modbusTask.deviceId = 'connection-1';
            modbusTask.name = 'task';
            modbusTask.config = { function: [ModbusFunctionName.READ_HOLDING_REGISTERS], address: 0, params: {} };

            await service.synchronizeModbusTaskList([modbusTask]);

            expect(modbusTaskRepository.saveMany).toHaveBeenCalledWith([modbusTask]);
        });

        it('should delegate a delete-flagged modbus task to the repository via synchronizeModbusTaskList', async () => {
            const modbusTask = new SynchronizeComRequestModel();
            modbusTask._id = 'task-1';
            modbusTask.delete = true;

            await service.synchronizeModbusTaskList([modbusTask]);

            expect(modbusTaskRepository.saveMany).toHaveBeenCalledWith([modbusTask]);
        });

        it('should cascade nested slave devices, forcing masterDeviceId, and their nested comrequests', async () => {
            const comRequest = new SynchronizeComRequestModel();
            comRequest.name = 'temperature';
            comRequest.config = { function: [ModbusFunctionName.READ_HOLDING_REGISTERS], address: 0, params: {} };

            const slave = Object.assign(new SynchronizeDeviceModel(), CreateSlaveDeviceModel());
            slave.comrequests = [comRequest];

            const master = Object.assign(new SynchronizeDeviceModel(), CreateMasterDeviceModel());
            master.devices = [slave];

            const devices = await service.synchronizeDeviceList([master]);
            const savedMaster = devices.find(device => device.type === DeviceType.MASTER);
            const savedSlaves = await deviceRepository.getSlavesByMasterId(savedMaster._id);

            expect(savedSlaves).toHaveLength(1);
            expect((savedSlaves[0].config as SlaveConfigModel).masterDeviceId).toBe(savedMaster._id);
            expect(modbusTaskRepository.replaceForDevice).toHaveBeenCalledWith(savedSlaves[0]._id, [comRequest]);
        });

        it('should soft-delete an existing slave device absent from an explicit nested devices array', async () => {
            const master = await deviceRepository.save(CreateMasterDeviceModel());
            const savedSlave = await deviceRepository.save(
                CreateSlaveDeviceModel({ masterDeviceId: master._id })
            );

            const masterSync = Object.assign(new SynchronizeDeviceModel(), master);
            masterSync.devices = []; // fourni explicitement et vide -> remplacement complet

            await service.synchronizeDeviceList([masterSync]);

            expect(await deviceRepository.get(savedSlave._id)).toBeNull();
        });

        it('should leave existing slave devices untouched when devices field is not provided (backward compatibility)', async () => {
            const master = await deviceRepository.save(CreateMasterDeviceModel());
            const savedSlave = await deviceRepository.save(
                CreateSlaveDeviceModel({ masterDeviceId: master._id })
            );

            const masterSync = Object.assign(new SynchronizeDeviceModel(), master);
            // devices/comrequests volontairement non renseignes

            await service.synchronizeDeviceList([masterSync]);

            expect(await deviceRepository.get(savedSlave._id)).not.toBeNull();
            expect(modbusTaskRepository.replaceForDevice).not.toHaveBeenCalled();
        });
    });

    describe('synchronizeTrigger', () => {
        it('should create a trigger and delegate initialization to TriggerService', async () => {
            const trigger = CreateTriggerModel({ id: undefined });

            const result = await service.synchronizeTrigger(trigger);

            expect(result.id).toBeDefined();
            expect(triggerService.initTrigger).toHaveBeenCalledWith(expect.objectContaining({ id: result.id }), false);
        });

        it('should soft delete a trigger via synchronizeTrigger({ delete: true }) and delegate to TriggerService', async () => {
            const created = await triggerRepository.save(CreateTriggerModel());

            const deleteModel = new SynchronizeTriggerModel();
            deleteModel.id = created.id;
            deleteModel.delete = true;
            const result = await service.synchronizeTrigger(deleteModel);

            expect(result.deletedAt).toBeDefined();
            expect(triggerService.initTrigger).toHaveBeenCalledWith(expect.objectContaining({ id: created.id }), true);
        });

        it('should fall back to the original trigger payload when repository.save resolves falsy', async () => {
            const trigger = CreateTriggerModel({ id: undefined });
            const saveSpy = jest.spyOn(triggerRepository, 'save').mockResolvedValueOnce(null);

            await service.synchronizeTrigger(trigger);

            expect(triggerService.initTrigger).toHaveBeenCalledWith(trigger, false);
            saveSpy.mockRestore();
        });
    });

    describe('synchronizeSchedule', () => {
        it('should create a schedule and register its cron job', async () => {
            const schedule = CreateScheduleModel({ _id: undefined });

            const result = await service.synchronizeSchedule(schedule);

            expect(result._id).toBeDefined();
            expect(schedulerRegistry.doesExist('cron', result._id)).toBe(true);
        });

        it('should soft delete a schedule via synchronizeSchedule({ delete: true }) and remove its cron job', async () => {
            const created = await scheduleRepository.save(CreateScheduleModel());
            scheduleService.createSchedule(created, jest.fn());

            const deleteModel = new SynchronizeScheduleModel();
            deleteModel._id = created._id;
            deleteModel.delete = true;
            const result = await service.synchronizeSchedule(deleteModel);

            expect(result.deletedAt).toBeDefined();
            expect(schedulerRegistry.doesExist('cron', created._id)).toBe(false);
        });

        it('should fall back to the original schedule payload when repository.save resolves falsy', async () => {
            const scheduleModel = CreateScheduleModel({ _id: undefined });
            const saveSpy = jest.spyOn(scheduleRepository, 'save').mockResolvedValueOnce(null);

            await service.synchronizeSchedule(scheduleModel);

            expect(configurationService.schedules).toContainEqual(scheduleModel);
            saveSpy.mockRestore();
        });
    });

    describe('sychronizeSensor', () => {
        it('should save the sensor and delegate its cron scheduling to SensorService', async () => {
            const sensor = { _id: 'sensor-1', type: SensorType.FORCAST } as SensorModel;

            await service.sychronizeSensor(sensor);

            expect(sensorRepository.save).toHaveBeenCalledWith(sensor);
            expect(sensorService.initScheduledSensor).toHaveBeenCalledWith(sensor, false);
        });

        it('should soft delete a sensor via sychronizeSensor({ delete: true }) and unregister its cron job', async () => {
            const deleteModel = { _id: 'sensor-1', delete: true } as SynchronizeSensorModel;

            await service.sychronizeSensor(deleteModel);

            expect(sensorRepository.delete).toHaveBeenCalledWith('sensor-1');
            expect(sensorService.initScheduledSensor).toHaveBeenCalledWith(expect.objectContaining({ _id: 'sensor-1' }), true);
        });

        it('should fall back to the original sensor payload when repository.save resolves falsy', async () => {
            const sensor = { _id: 'sensor-1', type: SensorType.FORCAST } as SensorModel;
            sensorRepository.save.mockResolvedValueOnce(null);

            await service.sychronizeSensor(sensor);

            expect(sensorService.initScheduledSensor).toHaveBeenCalledWith(sensor, false);
        });
    });

    describe('synchronize (bulk structure sync)', () => {
        it('should persist every collection and set configurationService.structure', async () => {
            const structureModel = new StructureModel();
            const cycleModel = new SynchronizeCycleModel();
            Object.assign(cycleModel, CreateCycleModel({ name: 'Zone A' }));
            structureModel.cycles = [cycleModel];
            structureModel.sensors = [{ _id: 'sensor-1', type: SensorType.FORCAST } as SensorModel];
            structureModel.modbusTasks = [];
            const expectedSensors = structureModel.sensors;

            const result = await service.synchronize(structureModel);

            expect(result.cycles).toHaveLength(1);
            expect(sensorRepository.replaceAll).toHaveBeenCalledWith(expectedSensors);
            expect(configurationService.structure).toBe(result);
        });

        it('should fall back to an empty array when sensors/modbusTasks are left undefined on the incoming structure', async () => {
            const structureModel = new StructureModel();
            const cycleModel = new SynchronizeCycleModel();
            Object.assign(cycleModel, CreateCycleModel({ name: 'Zone A' }));
            structureModel.cycles = [cycleModel];
            structureModel.sensors = undefined;
            structureModel.modbusTasks = undefined;

            await service.synchronize(structureModel);

            expect(sensorRepository.replaceAll).toHaveBeenCalledWith([]);
            expect(modbusTaskRepository.replaceAll).toHaveBeenCalledWith([]);
        });

        it('should soft delete only the cycle flagged delete:true, leaving the other one untouched', async () => {
            const kept = new SynchronizeCycleModel();
            Object.assign(kept, CreateCycleModel({ name: 'Zone A' }));
            const createdKept = await cycleRepository.save(kept);
            const removed = new SynchronizeCycleModel();
            Object.assign(removed, CreateCycleModel({ name: 'Zone B' }));
            const createdRemoved = await cycleRepository.save(removed);

            const keptAgain = new SynchronizeCycleModel();
            keptAgain._id = createdKept._id;
            Object.assign(keptAgain, CreateCycleModel({ _id: createdKept._id, name: 'Zone A' }));
            const removeAgain = new SynchronizeCycleModel();
            removeAgain._id = createdRemoved._id;
            removeAgain.delete = true;

            const structureModel = new StructureModel();
            structureModel.cycles = [keptAgain, removeAgain];
            structureModel.sensors = [];
            structureModel.modbusTasks = [];

            await service.synchronize(structureModel);

            expect(await cycleRepository.get(createdKept._id)).not.toBeNull();
            expect(await cycleRepository.get(createdRemoved._id)).toBeNull();
        });
    });
});
