import {
    CycleSynchronizeDTO,
    SequenceSync,
    SecurityConfigSync,
    moduleConfigsSync,
    ConditionSync,
    ChildCycleSync,
    ChildCycleConfigSync,
    ModePriority,
    ScheduleSynchronizeDTO,
    CronSync,
    SunBehavior,
    TriggerSynchronizeDTO,
    TriggerSync,
    SensorSynchronizeDTO,
    SensorConfigDTO,
    ValveSynchronizeDTO,
    ValveConfigDTO,
    ActuatorSynchronizeDTO,
    ActuatorConfigDTO,
    StructureSynchronizeDTO,
    DeviceConfigDTO,
    DeviceSynchronizeDTO,
    ComRequestDTO,
    ComRequestConfigDTO,
    ModbusTaskParams,
    PersistenceDTO,
    IsNumberOrString,
    IsNumberOrNumberArray
} from '@process/infrastructure/dto/synchronize.dto';
import { DeviceType, MasterProtocol } from '@process/domain/models/device.model';
import {
    CycleType,
    ExecutableAction,
    ExecutionMode,
    ProcessMode
} from '@process/domain/interfaces/executable.interface';
import { ConditionSymbolEnd, ConditionSymbolStart } from '@process/domain/models/condition.model';
import { SunState } from '@process/domain/interfaces/schedule.interface';
import { GPIODirection, GPIOEdge, ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { ComActuatorConfigModel, RpiActuatorConfigModel, CtrlActuatorConfigModel } from '@process/domain/models/actuator.model';
import { ComSensorConfigModel, ForcastSensorConfigModel, forcastDataName } from '@process/domain/models/sensor.model';
import { ModbusValueType } from '@process/domain/models/com-request.model';

describe('synchronize.dto (mapping vers les modeles domaine)', () => {
    describe('CycleSynchronizeDTO.mapToCycleModel', () => {
        function CreateMinimalDto(overrides: Partial<CycleSynchronizeDTO> = {}): CycleSynchronizeDTO {
            const dto = new CycleSynchronizeDTO();
            dto._id = 'cycle-1';
            dto.name = 'cycle';
            dto.description = 'description';
            return Object.assign(dto, overrides);
        }

        it('should map the basic fields', () => {
            const model = CycleSynchronizeDTO.mapToCycleModel(CreateMinimalDto());

            expect(model._id).toEqual('cycle-1');
            expect(model.name).toEqual('cycle');
        });

        it('should default type/executionMode/parentCycleId when absent', () => {
            const model = CycleSynchronizeDTO.mapToCycleModel(CreateMinimalDto());

            expect(model.type).toEqual(CycleType.CYCLE);
            expect(model.executionMode).toEqual(ExecutionMode.SEQUENTIAL);
            expect(model.parentCycleId).toBeNull();
        });

        it('should keep the explicit type/executionMode/parentCycleId when provided', () => {
            const dto = CreateMinimalDto({
                type: CycleType.GROUP,
                executionMode: ExecutionMode.PARALLEL,
                parentCycleId: 'parent-1'
            });

            const model = CycleSynchronizeDTO.mapToCycleModel(dto);

            expect(model.type).toEqual(CycleType.GROUP);
            expect(model.executionMode).toEqual(ExecutionMode.PARALLEL);
            expect(model.parentCycleId).toEqual('parent-1');
        });

        it('should default display to true when absent', () => {
            const model = CycleSynchronizeDTO.mapToCycleModel(CreateMinimalDto());

            expect(model.display).toBe(true);
        });

        it('should keep the explicit display value when provided', () => {
            const model = CycleSynchronizeDTO.mapToCycleModel(CreateMinimalDto({ display: false }));

            expect(model.display).toBe(false);
        });

        it('should default modePriority to MANUAL/SCHEDULED/TRIGGER (0/1/2) when absent', () => {
            const model = CycleSynchronizeDTO.mapToCycleModel(CreateMinimalDto());

            expect(model.modePriority).toEqual([
                { mode: ProcessMode.MANUAL, priority: 0 },
                { mode: ProcessMode.SCHEDULED, priority: 1 },
                { mode: ProcessMode.TRIGGER, priority: 2 }
            ]);
        });

        it('should keep the explicit modePriority array when provided', () => {
            const priority: ModePriority = Object.assign(new ModePriority(), { mode: ProcessMode.MANUAL, priority: 5 });
            const model = CycleSynchronizeDTO.mapToCycleModel(CreateMinimalDto({ modePriority: [priority] }));

            expect(model.modePriority).toEqual([{ mode: ProcessMode.MANUAL, priority: 5 }]);
        });

        it('should map every condition, including order/symbolStart/symbolEnd', () => {
            const first = Object.assign(new ConditionSync(), {
                name: 'c1', elementId: 'dev-1', elementType: 'SENSOR', operator: '>', value: 5,
                order: 0, symbolStart: ConditionSymbolStart.OPEN_PAREN, symbolEnd: ConditionSymbolEnd.AND
            });
            const second = Object.assign(new ConditionSync(), {
                name: 'c2', elementId: 'dev-2', elementType: 'SENSOR', operator: '<', value: 1,
                order: 1, symbolEnd: ConditionSymbolEnd.CLOSE_PAREN
            });
            const model = CycleSynchronizeDTO.mapToCycleModel(CreateMinimalDto({ conditions: [first, second] }));

            expect(model.conditions).toHaveLength(2);
            expect(model.conditions[0]).toEqual(expect.objectContaining({
                name: 'c1', elementId: 'dev-1', elementType: 'SENSOR',
                order: 0, symbolStart: ConditionSymbolStart.OPEN_PAREN, symbolEnd: ConditionSymbolEnd.AND
            }));
            expect(model.conditions[1]).toEqual(expect.objectContaining({
                name: 'c2', order: 1, symbolEnd: ConditionSymbolEnd.CLOSE_PAREN
            }));
        });

        it('should map childCycles one-to-one', () => {
            const child: ChildCycleSync = Object.assign(new ChildCycleSync(), {
                cycleId: 'child-1',
                config: Object.assign(new ChildCycleConfigSync(), {
                    order: 1, waitForCompletion: true, delayBefore: 10, delayAfter: 20, isSkipped: false
                })
            });
            const model = CycleSynchronizeDTO.mapToCycleModel(CreateMinimalDto({ childCycles: [child] }));

            expect(model.childCycles).toEqual([
                { cycleId: 'child-1', config: { order: 1, waitForCompletion: true, delayBefore: 10, delayAfter: 20, isSkipped: false } }
            ]);
        });

        it('should map a normal sequence with its module references and conditions', () => {
            const module1 = Object.assign(new moduleConfigsSync(), { moduleId: 'module-1' });
            const module2 = Object.assign(new moduleConfigsSync(), { moduleId: 'module-2' });
            const seqCondition = Object.assign(new ConditionSync(), { name: 'c1', elementId: 'dev-1', elementType: 'SENSOR', operator: '>', value: 1 });
            const sequenceSync = Object.assign(new SequenceSync(), {
                _id: 'seq-1', name: 'seq', moduleConfigs: [module1, module2],
                securityConfig: Object.assign(new SecurityConfigSync(), { maxDuration: 30, conditions: [seqCondition] })
            });

            const model = CycleSynchronizeDTO.mapToCycleModel(CreateMinimalDto({ sequences: [sequenceSync] }));

            expect(model.sequences).toHaveLength(1);
            const sequence = model.sequences[0];
            expect(sequence._id).toEqual('seq-1');
            expect(sequence.moduleConfigs).toHaveLength(2);
            expect(sequence.moduleConfigs[0]).toEqual({
                moduleId: 'module-1',
                configTiming: { waitBeforeExec: 0, waitAfterExec: 0, waitBeforeExecOff: 0, waitAfterExecOff: 0 }
            });
            expect(sequence.securityConfig.conditions).toHaveLength(1);
            expect(sequence.securityConfig.conditions[0]).toEqual(expect.objectContaining({ name: 'c1', elementId: 'dev-1' }));
        });

        it('should map a normal trigger with its conditions', () => {
            const triggerCondition = Object.assign(new ConditionSync(), { name: 'c1', elementId: 'dev-1', elementType: 'SENSOR', operator: '>', value: 1 });
            const triggerSync = Object.assign(new TriggerSynchronizeDTO(), {
                _id: 'trigger-1', shouldConfirmation: false, isPaused: false,
                trigger: Object.assign(new TriggerSync(), { timeAfter: 0 }), cycleId: 'cycle-1', delay: 0,
                action: ExecutableAction.ON, conditions: [triggerCondition]
            });

            const model = CycleSynchronizeDTO.mapToCycleModel(CreateMinimalDto({ triggers: [triggerSync] }));

            expect(model.triggers).toHaveLength(1);
            expect(model.triggers[0].id).toEqual('trigger-1');
            expect(model.triggers[0].conditions).toHaveLength(1);
        });

        it('should map a normal schedule', () => {
            const scheduleSync = Object.assign(new ScheduleSynchronizeDTO(), {
                _id: 'schedule-1', cycleId: 'cycle-1', name: 'sched', description: 'd',
                cron: Object.assign(new CronSync(), { pattern: '* * * * *' }), isPaused: false, shouldConfirmation: false
            });

            const model = CycleSynchronizeDTO.mapToCycleModel(CreateMinimalDto({ schedules: [scheduleSync] }));

            expect(model.schedules).toHaveLength(1);
            expect(model.schedules[0]._id).toEqual('schedule-1');
            expect(model.schedules[0].cron.pattern).toEqual('* * * * *');
        });

        it('should map a nested schedule sunBehavior sub-object when present', () => {
            const schedule = Object.assign(new ScheduleSynchronizeDTO(), {
                _id: 'schedule-1', cycleId: 'cycle-1', name: 'sched', description: 'd', isPaused: false, shouldConfirmation: false,
                cron: Object.assign(new CronSync(), { sunBehavior: Object.assign(new SunBehavior(), { sunState: SunState.SUNSET, time: 60 }) })
            });

            const model = CycleSynchronizeDTO.mapToCycleModel(CreateMinimalDto({ schedules: [schedule] }));

            expect(model.schedules[0].cron.sunBehavior).toEqual(expect.objectContaining({ sunState: SunState.SUNSET, time: 60 }));
        });

        it('should default to empty arrays when conditions/sequences/triggers/schedules/childCycles are absent', () => {
            const model = CycleSynchronizeDTO.mapToCycleModel(CreateMinimalDto());

            expect(model.conditions).toEqual([]);
            expect(model.sequences).toEqual([]);
            expect(model.triggers).toEqual([]);
            expect(model.schedules).toEqual([]);
            expect(model.childCycles).toEqual([]);
        });
    });

    describe('ScheduleSynchronizeDTO.mapToScheduleModel', () => {
        function CreateDto(overrides: Partial<ScheduleSynchronizeDTO> = {}): ScheduleSynchronizeDTO {
            const dto = new ScheduleSynchronizeDTO();
            dto._id = 'schedule-1';
            dto.cycleId = 'cycle-1';
            dto.name = 'schedule';
            dto.description = 'description';
            dto.cron = Object.assign(new CronSync(), { pattern: '* * * * *' });
            dto.isPaused = false;
            dto.shouldConfirmation = false;
            return Object.assign(dto, overrides);
        }

        it('should map the basic fields', () => {
            const model = ScheduleSynchronizeDTO.mapToScheduleModel(CreateDto());

            expect(model._id).toEqual('schedule-1');
        });

        it('should copy the cron pattern/date/after fields', () => {
            const cron = Object.assign(new CronSync(), { pattern: '0 0 * * *', after: 5000, date: new Date('2026-01-01') });
            const model = ScheduleSynchronizeDTO.mapToScheduleModel(CreateDto({ cron }));

            expect(model.cron.pattern).toEqual('0 0 * * *');
            expect(model.cron.date).toEqual(new Date('2026-01-01'));
        });

        it('should map a sunBehavior sub-object when present', () => {
            const cron = Object.assign(new CronSync(), { sunBehavior: Object.assign(new SunBehavior(), { sunState: SunState.SUNRISE, time: 300 }) });
            const model = ScheduleSynchronizeDTO.mapToScheduleModel(CreateDto({ cron }));

            expect(model.cron.sunBehavior).toEqual(expect.objectContaining({ sunState: SunState.SUNRISE, time: 300 }));
        });

        it('should leave sunBehavior undefined when absent', () => {
            const model = ScheduleSynchronizeDTO.mapToScheduleModel(CreateDto());

            expect(model.cron.sunBehavior).toBeUndefined();
        });
    });

    describe('TriggerSynchronizeDTO.mapToTriggerModel', () => {
        function CreateDto(overrides: Partial<TriggerSynchronizeDTO> = {}): TriggerSynchronizeDTO {
            const dto = new TriggerSynchronizeDTO();
            dto._id = 'trigger-1';
            dto.cycleId = 'cycle-1';
            dto.action = ExecutableAction.ON;
            dto.trigger = Object.assign(new TriggerSync(), { timeAfter: 0 });
            dto.isPaused = false;
            dto.delay = 0;
            dto.shouldConfirmation = false;
            return Object.assign(dto, overrides);
        }

        it('should map the basic fields', () => {
            const model = TriggerSynchronizeDTO.mapToTriggerModel(CreateDto());

            expect(model.id).toEqual('trigger-1');
        });

        it('should map a sunBehavior sub-object when present', () => {
            const trigger = Object.assign(new TriggerSync(), {
                timeAfter: 0, sunBehavior: Object.assign(new SunBehavior(), { sunState: SunState.SUNSET, time: -60 })
            });
            const model = TriggerSynchronizeDTO.mapToTriggerModel(CreateDto({ trigger }));

            expect(model.trigger.sunBehavior).toEqual(expect.objectContaining({ sunState: SunState.SUNSET, time: -60 }));
        });

        it('should map every condition', () => {
            const condition = Object.assign(new ConditionSync(), { name: 'c1', elementId: 'dev-1', elementType: 'SENSOR', operator: '>', value: 1 });
            const model = TriggerSynchronizeDTO.mapToTriggerModel(CreateDto({ conditions: [condition] }));

            expect(model.conditions).toHaveLength(1);
            expect(model.conditions[0]).toEqual(expect.objectContaining({ name: 'c1', elementId: 'dev-1' }));
        });

        it('should default conditions to an empty array when absent', () => {
            const model = TriggerSynchronizeDTO.mapToTriggerModel(CreateDto());

            expect(model.conditions).toEqual([]);
        });
    });

    describe('SensorSynchronizeDTO.mapToSensorModel', () => {
        it('should map a FORCAST sensor and its config', () => {
            const dto = Object.assign(new SensorSynchronizeDTO(), {
                id: 'sensor-1', name: 'sensor', description: 'd', type: SensorType.FORCAST,
                config: Object.assign(new SensorConfigDTO(), { cronPattern: '0 0 * * *', forcastData: forcastDataName.TEMPERATURE_2M_MAX })
            });

            const model = SensorSynchronizeDTO.mapToSensorModel(dto);

            expect(model._id).toEqual('sensor-1');
            expect(model.name).toEqual('sensor');
            expect(model.type).toEqual(SensorType.FORCAST);
            expect((model.config as ForcastSensorConfigModel).cronPattern).toEqual('0 0 * * *');
            expect((model.config as ForcastSensorConfigModel).forcastData).toEqual(forcastDataName.TEMPERATURE_2M_MAX);
        });

        it('should map a COM sensor and its config', () => {
            const dto = Object.assign(new SensorSynchronizeDTO(), {
                id: 'sensor-2', name: 'sensor', description: 'd', type: SensorType.COM,
                config: Object.assign(new SensorConfigDTO(), { cronPattern: '*/30 * * * * *', comRequestId: 'request-1' })
            });

            const model = SensorSynchronizeDTO.mapToSensorModel(dto);

            expect(model.type).toEqual(SensorType.COM);
            expect((model.config as ComSensorConfigModel).comRequestId).toEqual('request-1');
        });

        it('should map a child sensor (parentId set) to a code/scale/unit config', () => {
            const dto = Object.assign(new SensorSynchronizeDTO(), {
                id: 'sensor-3', name: 'child sensor', description: 'd', type: SensorType.COM,
                parentId: 'sensor-parent',
                config: Object.assign(new SensorConfigDTO(), { code: 12, scale: 0.1, unit: 'V' })
            });

            const model = SensorSynchronizeDTO.mapToSensorModel(dto);

            expect(model.parentId).toEqual('sensor-parent');
            expect((model.config as ComSensorConfigModel).code).toEqual(12);
            expect((model.config as ComSensorConfigModel).scale).toEqual(0.1);
            expect((model.config as ComSensorConfigModel).unit).toEqual('V');
        });
    });

    describe('ValveSynchronizeDTO.mapToValveModel', () => {
        function CreateDto(overrides: Partial<ValveSynchronizeDTO> = {}): ValveSynchronizeDTO {
            const dto = new ValveSynchronizeDTO();
            dto.id = 'valve-1';
            dto.name = 'valve';
            dto.description = 'description';
            dto.config = Object.assign(new ValveConfigDTO(), { deviceId: 'conn-1', channel: 1, flowMeterId: 'fm-1' });
            return Object.assign(dto, overrides);
        }

        it('should map the basic fields and default the type to PROPORTIONAL', () => {
            const model = ValveSynchronizeDTO.mapToValveModel(CreateDto());

            expect(model._id).toEqual('valve-1');
            expect(model.type).toEqual(ActuatorType.CTRL);
            expect((model.config as CtrlActuatorConfigModel).valveType).toEqual('PROPORTIONAL');
            expect((model.config as CtrlActuatorConfigModel).deviceId).toEqual('conn-1');
            expect((model.config as CtrlActuatorConfigModel).channel).toEqual(1);
        });

        it('should keep an explicit type when provided', () => {
            const model = ValveSynchronizeDTO.mapToValveModel(CreateDto({ type: 'ONOFF' }));

            expect((model.config as CtrlActuatorConfigModel).valveType).toEqual('ONOFF');
        });

        it('should map actions through to the CtrlActuatorConfigModel', () => {
            const dto = CreateDto();
            dto.config.actions = [{ comRequestId: 'ao8ch-write-channel', digitalPort: 2 }];

            const model = ValveSynchronizeDTO.mapToValveModel(dto);

            expect((model.config as CtrlActuatorConfigModel).actions).toEqual([{ comRequestId: 'ao8ch-write-channel', digitalPort: 2 }]);
        });
    });

    describe('ActuatorSynchronizeDTO.mapToActuatorModel', () => {
        it('should map an RPI actuator and set status to OFF', () => {
            const dto = Object.assign(new ActuatorSynchronizeDTO(), {
                _id: 'actuator-1', type: ActuatorType.RPI, name: '16',
                config: Object.assign(new ActuatorConfigDTO(), { direction: GPIODirection.OUT, edge: GPIOEdge.BOTH })
            });

            const model = ActuatorSynchronizeDTO.mapToActuatorModel(dto);

            expect(model._id).toEqual('actuator-1');
            expect(model.type).toEqual(ActuatorType.RPI);
            expect(model.name).toEqual('16');
            expect(model.status).toEqual(ModuleStatus.OFF);
            expect((model.config as RpiActuatorConfigModel).direction).toEqual(GPIODirection.OUT);
        });

        it('should map a COM actuator and set status to OFF', () => {
            const dto = Object.assign(new ActuatorSynchronizeDTO(), {
                _id: 'actuator-com-1', type: ActuatorType.COM, name: '2',
                config: Object.assign(new ActuatorConfigDTO(), { deviceId: 'com-1' })
            });

            const model = ActuatorSynchronizeDTO.mapToActuatorModel(dto);

            expect(model._id).toEqual('actuator-com-1');
            expect(model.type).toEqual(ActuatorType.COM);
            expect(model.name).toEqual('2');
            expect(model.status).toEqual(ModuleStatus.OFF);
            expect((model.config as ComActuatorConfigModel).deviceId).toEqual('com-1');
        });
    });

    describe('StructureSynchronizeDTO.mapToStructureModel', () => {
        it('should map every cycle and sensor of the incoming structure', () => {
            const cycleDto = Object.assign(new CycleSynchronizeDTO(), { _id: 'cycle-1', name: 'cycle', description: 'd' });
            const sensorDto = Object.assign(new SensorSynchronizeDTO(), {
                id: 'sensor-1', name: 'sensor', type: SensorType.FORCAST,
                config: Object.assign(new SensorConfigDTO(), { cronPattern: '0 0 * * *', forcastData: forcastDataName.TEMPERATURE_2M_MAX })
            });
            const dto = Object.assign(new StructureSynchronizeDTO(), { cycles: [cycleDto], sensors: [sensorDto] });

            const model = StructureSynchronizeDTO.mapToStructureModel(dto);

            expect(model.cycles).toHaveLength(1);
            expect(model.cycles[0]._id).toEqual('cycle-1');
            expect(model.sensors).toHaveLength(1);
            expect(model.sensors[0]._id).toEqual('sensor-1');
        });

        it('should default cycles/sensors to empty arrays when absent', () => {
            const model = StructureSynchronizeDTO.mapToStructureModel(new StructureSynchronizeDTO());

            expect(model.cycles).toEqual([]);
            expect(model.sensors).toEqual([]);
        });
    });

    describe('DeviceSynchronizeDTO.mapToDeviceModel', () => {
        it('should map a MASTER device with a MasterConfigModel config', () => {
            const dto = Object.assign(new DeviceSynchronizeDTO(), {
                _id: 'device-1', name: 'master', description: 'd', type: DeviceType.MASTER,
                config: Object.assign(new DeviceConfigDTO(), { protocol: MasterProtocol.TCP, ipAddress: '10.0.0.1', port: 502, timeout: 2000 })
            });

            const model = DeviceSynchronizeDTO.mapToDeviceModel(dto);

            expect(model._id).toEqual('device-1');
            expect(model.type).toEqual(DeviceType.MASTER);
            expect(model.config).toEqual(expect.objectContaining({ protocol: MasterProtocol.TCP, ipAddress: '10.0.0.1', port: 502 }));
        });

        it('should map a SLAVE device with a SlaveConfigModel config', () => {
            const dto = Object.assign(new DeviceSynchronizeDTO(), {
                _id: 'device-2', name: 'slave', description: 'd', type: DeviceType.SLAVE,
                config: Object.assign(new DeviceConfigDTO(), { slaveId: 1, masterDeviceId: 'device-1' })
            });

            const model = DeviceSynchronizeDTO.mapToDeviceModel(dto);

            expect(model._id).toEqual('device-2');
            expect(model.type).toEqual(DeviceType.SLAVE);
            expect(model.config).toEqual(expect.objectContaining({ slaveId: 1, masterDeviceId: 'device-1' }));
        });
    });

    describe('ComRequestDTO.mapToComRequestModel', () => {
        it('should map the fields, including nested params', () => {
            const dto = Object.assign(new ComRequestDTO(), {
                _id: 'task-1', deviceId: 'conn-1', name: 'task',
                config: Object.assign(new ComRequestConfigDTO(), {
                    function: ['readHoldingRegisters'], address: 100,
                    params: Object.assign(new ModbusTaskParams(), { length: 2, scale: 0.1, unit: '°C' })
                })
            });

            const model = ComRequestDTO.mapToComRequestModel(dto);

            expect(model._id).toEqual('task-1');
            expect(model.deviceId).toEqual('conn-1');
            expect(model.config.params).toEqual({ length: 2, scale: 0.1, unit: '°C' });
        });

        it('should map the optional persistence field when present', () => {
            const dto = Object.assign(new ComRequestDTO(), {
                _id: 'task-2', deviceId: 'conn-1', name: 'task',
                config: Object.assign(new ComRequestConfigDTO(), {
                    function: ['writeRegister'], address: 100,
                    params: Object.assign(new ModbusTaskParams(), {
                        length: 1, scale: 1, unit: '',
                        persistence: Object.assign(new PersistenceDTO(), { persist: true, address: 0x1000 })
                    })
                })
            });

            const model = ComRequestDTO.mapToComRequestModel(dto);

            expect(model.config.params.persistence).toEqual({ persist: true, address: 0x1000 });
        });

        it('should leave persistence undefined when absent (backward compatibility)', () => {
            const dto = Object.assign(new ComRequestDTO(), {
                _id: 'task-3', deviceId: 'conn-1', name: 'task',
                config: Object.assign(new ComRequestConfigDTO(), {
                    function: ['readHoldingRegisters'], address: 100,
                    params: Object.assign(new ModbusTaskParams(), { length: 2, scale: 0.1, unit: '°C' })
                })
            });

            const model = ComRequestDTO.mapToComRequestModel(dto);

            expect(model.config.params.persistence).toBeUndefined();
        });

        it('should map a scalar value', () => {
            const dto = Object.assign(new ComRequestDTO(), {
                _id: 'task-4', deviceId: 'conn-1', name: 'task',
                config: Object.assign(new ComRequestConfigDTO(), {
                    function: ['writeRegister'], address: 100,
                    params: Object.assign(new ModbusTaskParams(), { length: 1, scale: 1, unit: '', value: 42 })
                })
            });

            const model = ComRequestDTO.mapToComRequestModel(dto);

            expect(model.config.params.value).toEqual(42);
        });

        it('should map an array value', () => {
            const dto = Object.assign(new ComRequestDTO(), {
                _id: 'task-5', deviceId: 'conn-1', name: 'task',
                config: Object.assign(new ComRequestConfigDTO(), {
                    function: ['writeRegisters'], address: 100,
                    params: Object.assign(new ModbusTaskParams(), { length: 2, scale: 1, unit: '', value: [1, 2] })
                })
            });

            const model = ComRequestDTO.mapToComRequestModel(dto);

            expect(model.config.params.value).toEqual([1, 2]);
        });

        it('should map type and formula', () => {
            const dto = Object.assign(new ComRequestDTO(), {
                _id: 'task-6', deviceId: 'conn-1', name: 'task',
                config: Object.assign(new ComRequestConfigDTO(), {
                    function: ['readHoldingRegisters'], address: 100, type: ModbusValueType.CUMULATIVE,
                    params: Object.assign(new ModbusTaskParams(), {
                        length: 4, scale: 1, unit: 'm³', formula: '(N + Nf) * 10^(n - 3)'
                    })
                })
            });

            const model = ComRequestDTO.mapToComRequestModel(dto);

            expect(model.config.type).toEqual(ModbusValueType.CUMULATIVE);
            expect(model.config.params.formula).toEqual('(N + Nf) * 10^(n - 3)');
        });

        it('should leave type and formula undefined when absent (backward compatibility)', () => {
            const dto = Object.assign(new ComRequestDTO(), {
                _id: 'task-7', deviceId: 'conn-1', name: 'task',
                config: Object.assign(new ComRequestConfigDTO(), {
                    function: ['readHoldingRegisters'], address: 100,
                    params: Object.assign(new ModbusTaskParams(), { length: 2, scale: 0.1, unit: '°C' })
                })
            });

            const model = ComRequestDTO.mapToComRequestModel(dto);

            expect(model.config.type).toBeUndefined();
            expect(model.config.params.formula).toBeUndefined();
        });
    });

    describe('IsNumberOrNumberArray validator', () => {
        const validator = new IsNumberOrNumberArray();

        it('should accept a number', () => {
            expect(validator.validate(42, null)).toBe(true);
        });

        it('should accept an array of numbers', () => {
            expect(validator.validate([1, 2, 3], null)).toBe(true);
        });

        it('should reject an array containing a non-number', () => {
            expect(validator.validate([1, '2'], null)).toBe(false);
        });

        it('should reject a string', () => {
            expect(validator.validate('42', null)).toBe(false);
        });
    });

    describe('IsNumberOrString validator', () => {
        const validator = new IsNumberOrString();

        it('should accept a number', () => {
            expect(validator.validate(42, null)).toBe(true);
        });

        it('should accept a string', () => {
            expect(validator.validate('ON', null)).toBe(true);
        });

        it('should reject any other type', () => {
            expect(validator.validate({ a: 1 }, null)).toBe(false);
            expect(validator.validate(null, null)).toBe(false);
            expect(validator.validate(undefined, null)).toBe(false);
        });

        it('should return the class-validator message template (substitution happens upstream)', () => {
            expect(validator.defaultMessage({ value: 'bad' } as never)).toEqual('($value) must be number or string');
        });
    });
});
