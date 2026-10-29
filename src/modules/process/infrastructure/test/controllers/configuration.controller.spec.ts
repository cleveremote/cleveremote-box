import { ConfigurationController } from '@process/infrastructure/controllers/configuration.controller';
import { StructureService } from '@process/domain/services/configuration.service';
import { SynchronizeService } from '@process/domain/services/synchronize.service';
import {
    CycleSynchronizeDTO,
    DeviceCommandDTO,
    DeviceConfigDTO,
    DeviceSynchronizeDTO,
    ActuatorConfigDTO,
    ActuatorSynchronizeDTO,
    ScheduleSynchronizeDTO,
    SensorSynchronizeDTO,
    SensorConfigDTO,
    StructureSynchronizeDTO,
    TriggerSync,
    TriggerSynchronizeDTO,
    ValveConfigDTO,
    ValveSynchronizeDTO,
    CronSync
} from '@process/infrastructure/dto/synchronize.dto';
import { ExecutableAction } from '@process/domain/interfaces/executable.interface';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { DeviceType, MasterProtocol } from '@process/domain/models/device.model';
import { DeviceCommandType } from '@process/domain/models/device-command.model';

describe('ConfigurationController', () => {
    let configurationService: { getConfigurationWithStatus: jest.Mock; getStatus: jest.Mock };
    let synchronizeService: Record<string, jest.Mock>;
    let controller: ConfigurationController;

    beforeEach(() => {
        configurationService = { getConfigurationWithStatus: jest.fn(), getStatus: jest.fn() };
        synchronizeService = {
            synchronize: jest.fn(),
            synchronizeDeviceList: jest.fn(),
            synchronizeDeviceCommandList: jest.fn(),
            synchronizeCycle: jest.fn(),
            synchronizeSchedule: jest.fn(),
            synchronizeTrigger: jest.fn(),
            sychronizeSensor: jest.fn(),
            synchronizeValve: jest.fn(),
            synchronizeActuatorList: jest.fn()
        };
        controller = new ConfigurationController(
            configurationService as unknown as StructureService,
            {} as never,
            synchronizeService as unknown as SynchronizeService,
            {} as never
        );
    });

    it('should map and delegate a structure synchronization', async () => {
        synchronizeService.synchronize.mockResolvedValue('result');
        const dto = Object.assign(new StructureSynchronizeDTO(), { cycles: [], sensors: [] });

        const result = await controller.synchronise(dto);

        expect(result).toEqual('result');
        expect(synchronizeService.synchronize).toHaveBeenCalledWith(expect.objectContaining({ cycles: [], sensors: [] }));
    });

    it('should map and delegate a device list synchronization', async () => {
        synchronizeService.synchronizeDeviceList.mockResolvedValue(['result']);
        const masterDto = Object.assign(new DeviceSynchronizeDTO(), {
            _id: 'device-1', name: 'master', description: 'd', type: DeviceType.MASTER,
            config: Object.assign(new DeviceConfigDTO(), { protocol: MasterProtocol.TCP, ipAddress: '10.0.0.1', port: 502, timeout: 2000 })
        });
        const slaveDto = Object.assign(new DeviceSynchronizeDTO(), {
            _id: 'device-2', name: 'slave', description: 'd', type: DeviceType.SLAVE,
            config: Object.assign(new DeviceConfigDTO(), { slaveId: 1, masterDeviceId: 'device-1' })
        });

        const result = await controller.synchroniseDevice([masterDto, slaveDto]);

        expect(result).toEqual(['result']);
        expect(synchronizeService.synchronizeDeviceList).toHaveBeenCalledWith([
            expect.objectContaining({ _id: 'device-1', type: DeviceType.MASTER }),
            expect.objectContaining({ _id: 'device-2', type: DeviceType.SLAVE })
        ]);
    });

    it('should map and delegate a device command list synchronization', async () => {
        synchronizeService.synchronizeDeviceCommandList.mockResolvedValue(['result']);
        const dto = Object.assign(new DeviceCommandDTO(), {
            _id: 'command-1', deviceId: 'slave-1', name: 'DO', blockId: 'outputs', operationId: 'set', channel: 2, types: [DeviceCommandType.INIT]
        });

        const result = await controller.synchroniseDeviceCommand([dto]);

        expect(result).toEqual(['result']);
        expect(synchronizeService.synchronizeDeviceCommandList).toHaveBeenCalledWith([
            expect.objectContaining({ _id: 'command-1', blockId: 'outputs', operationId: 'set', channel: 2, types: [DeviceCommandType.INIT], isDone: false, delete: false })
        ]);
    });

    it('should map and delegate a cycle synchronization', async () => {
        synchronizeService.synchronizeCycle.mockResolvedValue('result');
        const dto = Object.assign(new CycleSynchronizeDTO(), { _id: 'cycle-1', name: 'cycle', description: 'd' });

        const result = await controller.synchronisePartial(dto);

        expect(result).toEqual('result');
        expect(synchronizeService.synchronizeCycle).toHaveBeenCalledWith(expect.objectContaining({ _id: 'cycle-1' }));
    });

    it('should map and delegate a schedule synchronization', async () => {
        synchronizeService.synchronizeSchedule.mockResolvedValue('result');
        const dto = Object.assign(new ScheduleSynchronizeDTO(), {
            _id: 'schedule-1', cycleId: 'cycle-1', name: 's', description: 'd',
            cron: Object.assign(new CronSync(), { pattern: '* * * * *' }), isPaused: false, shouldConfirmation: false
        });

        const result = await controller.synchroniseSchedule(dto);

        expect(result).toEqual('result');
        expect(synchronizeService.synchronizeSchedule).toHaveBeenCalledWith(expect.objectContaining({ _id: 'schedule-1' }));
    });

    it('should map and delegate a trigger synchronization', async () => {
        synchronizeService.synchronizeTrigger.mockResolvedValue('result');
        const dto = Object.assign(new TriggerSynchronizeDTO(), {
            _id: 'trigger-1', cycleId: 'cycle-1', action: ExecutableAction.ON,
            trigger: Object.assign(new TriggerSync(), { timeAfter: 0 }), isPaused: false, delay: 0, shouldConfirmation: false
        });

        const result = await controller.synchroniseTrigger(dto);

        expect(result).toEqual('result');
        expect(synchronizeService.synchronizeTrigger).toHaveBeenCalledWith(expect.objectContaining({ id: 'trigger-1' }));
    });

    it('should map and delegate a sensor synchronization', async () => {
        synchronizeService.sychronizeSensor.mockResolvedValue('result');
        const dto = Object.assign(new SensorSynchronizeDTO(), {
            id: 'sensor-1', name: 's', type: SensorType.FORCAST,
            config: Object.assign(new SensorConfigDTO(), { cronPattern: '0 0 * * *' })
        });

        const result = await controller.synchroniseSensor(dto);

        expect(result).toEqual('result');
        expect(synchronizeService.sychronizeSensor).toHaveBeenCalledWith(expect.objectContaining({ _id: 'sensor-1' }));
    });

    it('should map and delegate a valve synchronization', async () => {
        synchronizeService.synchronizeValve.mockResolvedValue('result');
        const dto = Object.assign(new ValveSynchronizeDTO(), {
            id: 'valve-1', name: 'v', description: 'd',
            config: Object.assign(new ValveConfigDTO(), { deviceId: 'conn-1', channel: 1, flowMeterId: 'fm-1' })
        });

        const result = await controller.synchroniseValve(dto);

        expect(result).toEqual('result');
        expect(synchronizeService.synchronizeValve).toHaveBeenCalledWith(expect.objectContaining({ _id: 'valve-1' }));
    });

    it('should map and delegate a actuator list synchronization (rpi and com)', async () => {
        synchronizeService.synchronizeActuatorList.mockResolvedValue(['result']);
        const rpiDto = Object.assign(new ActuatorSynchronizeDTO(), {
            _id: 'actuator-1', type: ActuatorType.RPI, name: '16', config: Object.assign(new ActuatorConfigDTO(), {})
        });
        const comDto = Object.assign(new ActuatorSynchronizeDTO(), {
            _id: 'actuator-com-1', type: ActuatorType.COM, name: '2', config: Object.assign(new ActuatorConfigDTO(), { deviceId: 'com-1' })
        });

        const result = await controller.synchroniseActuator([rpiDto, comDto]);

        expect(result).toEqual(['result']);
        expect(synchronizeService.synchronizeActuatorList).toHaveBeenCalledWith([
            expect.objectContaining({ _id: 'actuator-1', type: ActuatorType.RPI }),
            expect.objectContaining({ _id: 'actuator-com-1', type: ActuatorType.COM })
        ]);
    });

    describe('getConfiguration', () => {
        it('should return the current configuration as JSON, stripping any "instance" field', async () => {
            configurationService.getConfigurationWithStatus.mockResolvedValue({ cycles: [{ _id: 'c1', instance: { a: 1 } }] });

            const result = await controller.getConfiguration();

            expect(JSON.parse(result)).toEqual({ cycles: [{ _id: 'c1' }] });
        });
    });

    describe('getPlan', () => {
        it('should return the literal "svg" placeholder', async () => {
            await expect(controller.getPlan()).resolves.toEqual('svg');
        });
    });

    describe('getStatus', () => {
        it('should delegate to ValuesFetchUC with the given type and strip "instance"', async () => {
            configurationService.getStatus.mockResolvedValue([{ id: 'p1', instance: {} }]);

            const result = await controller.getStatus({ type: 'PROCESS' });

            expect(configurationService.getStatus).toHaveBeenCalledWith('PROCESS');
            expect(JSON.parse(result)).toEqual([{ id: 'p1' }]);
        });
    });
});
