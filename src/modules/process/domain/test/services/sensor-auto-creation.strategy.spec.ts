import {
    SENSOR_DEFAULT_CRON_PATTERN, SensorAutoCreationStrategy
} from '@process/domain/services/slave-provisioning/auto-creation/strategies/sensor-auto-creation.strategy';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { DeviceCommandType } from '@process/domain/models/device-command.model';
import { DeviceModel, DeviceType, SlaveTemplate } from '@process/domain/models/device.model';
import { isValidUuid } from '@process/domain/utils/id.util';
import { CreateDeviceCommandServiceMock, CreateLoggerMock, MASTER_ID, TH_SENSOR_TEMPLATE } from './slave-provisioning.spec-mock';

function CreateSlave(template: SlaveTemplate): DeviceModel {
    return {
        _id: 'd0000000-0000-4000-8000-000000000001',
        name: template.device.name,
        type: DeviceType.SLAVE,
        config: { slaveId: 62, masterDeviceId: MASTER_ID, kind: template.kind, modelId: template._id, initDoneCommandIds: [] },
        deletedAt: null
    } as DeviceModel;
}

describe('SensorAutoCreationStrategy', () => {
    let deviceCommandService: ReturnType<typeof CreateDeviceCommandServiceMock>;
    let logger: ReturnType<typeof CreateLoggerMock>;
    let strategy: SensorAutoCreationStrategy;

    beforeEach(() => {
        deviceCommandService = CreateDeviceCommandServiceMock();
        logger = CreateLoggerMock();
        strategy = new SensorAutoCreationStrategy(deviceCommandService as never, logger as never);
    });

    it('should create a parent sensor read on its cron and one child sensor per autoCreate field', async () => {
        const device = CreateSlave(TH_SENSOR_TEMPLATE);

        const { actuators, cycles, sensors } = await strategy.build({ device, template: TH_SENSOR_TEMPLATE });

        expect(actuators).toEqual([]);
        expect(cycles).toEqual([]);
        expect(deviceCommandService.withTemplateParams).toHaveBeenCalledWith(TH_SENSOR_TEMPLATE);
        const [parent, ...children] = sensors;
        expect(isValidUuid(parent._id)).toBe(true);
        expect(parent).toMatchObject({
            name: 'TH SENSOR Mesures', type: SensorType.COM, display: false, parentId: null,
            config: { commandId: TH_SENSOR_TEMPLATE.deviceCommands[0]._id, deviceId: device._id, cronPattern: SENSOR_DEFAULT_CRON_PATTERN }
        });
        expect(children.map((child) => child.config)).toEqual([{ field: 'humidity' }, { field: 'temperature' }]);
        expect(children.map((child) => child.name)).toEqual(['TH SENSOR Humidité', 'TH SENSOR Température']);
        expect(children.map((child) => child.description)).toEqual(['TH SENSOR Humidité', 'Température air']);
        children.forEach((child) => expect(child).toMatchObject({ type: SensorType.COM, parentId: parent._id, display: true }));
    });

    it('should only keep the autoCreate fields retained by the command fields', async () => {
        const [monitoring, ...others] = TH_SENSOR_TEMPLATE.deviceCommands;
        const template = { ...TH_SENSOR_TEMPLATE, deviceCommands: [{ ...monitoring, fields: ['temperature'] }, ...others] };

        const { sensors } = await strategy.build({ device: CreateSlave(template), template });

        expect(sensors.slice(1).map((child) => child.config)).toEqual([{ field: 'temperature' }]);
    });

    it('should ignore commands that are not reads or have no autoCreate field', async () => {
        const [monitoring, calibration] = TH_SENSOR_TEMPLATE.deviceCommands;
        const template = { ...TH_SENSOR_TEMPLATE, deviceCommands: [{ ...monitoring, types: [DeviceCommandType.SET] }, calibration] };

        const { sensors } = await strategy.build({ device: CreateSlave(template), template });

        expect(sensors).toEqual([]);
        expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ kind: template.kind }), 'no autoCreate read field, sensors not created');
    });

    it('should ignore a command without _id or without resolved params', async () => {
        const [monitoring] = TH_SENSOR_TEMPLATE.deviceCommands;
        const template = { ...TH_SENSOR_TEMPLATE, deviceCommands: [{ ...monitoring, _id: undefined }, { ...monitoring, params: undefined }] };

        const { sensors } = await strategy.build({ device: CreateSlave(template), template });

        expect(sensors).toEqual([]);
    });
});
