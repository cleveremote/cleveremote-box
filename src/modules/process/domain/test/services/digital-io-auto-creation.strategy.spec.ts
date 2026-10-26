import {
    DigitalIoAutoCreationStrategy
} from '@process/domain/services/slave-provisioning/auto-creation/strategies/digital-io-auto-creation.strategy';
import { CycleType, ProcessMode } from '@process/domain/interfaces/executable.interface';
import { ActuatorType, ComActuatorConfigModel } from '@process/domain/models/actuator.model';
import { DeviceModel, DeviceType, SlaveTemplate } from '@process/domain/models/device.model';
import { isValidUuid } from '@process/domain/utils/id.util';
import { CreateDeviceCommandServiceMock, CreateLoggerMock, DIGITAL_IO_TEMPLATE, MASTER_ID, WithPorts } from './slave-provisioning.spec-mock';

function CreateSlave(template: SlaveTemplate, id = 'd0000000-0000-4000-8000-000000000001'): DeviceModel {
    return {
        _id: id,
        name: template.device.name,
        description: template.device.description,
        type: DeviceType.SLAVE,
        config: {
            slaveId: 62, masterDeviceId: MASTER_ID, kind: template.kind, modelId: template._id,
            initDoneCommandIds: [], portConfig: template.device.portConfig
        },
        deletedAt: null
    };
}

describe('DigitalIoAutoCreationStrategy', () => {
    let logger: ReturnType<typeof CreateLoggerMock>;
    let strategy: DigitalIoAutoCreationStrategy;

    beforeEach(() => {
        logger = CreateLoggerMock();
        strategy = new DigitalIoAutoCreationStrategy(CreateDeviceCommandServiceMock() as never, logger as never);
    });

    it('should create nothing without port config', async () => {
        const { actuators, cycles } = await strategy.build({ device: CreateSlave(DIGITAL_IO_TEMPLATE), template: DIGITAL_IO_TEMPLATE });

        expect(actuators).toEqual([]);
        expect(cycles).toEqual([]);
    });

    it('should create one COM actuator per output port, driven on its channel by the digital output command', async () => {
        const template = WithPorts(DIGITAL_IO_TEMPLATE, 3);
        const device = CreateSlave(template);

        const { actuators } = await strategy.build({ device, template });

        expect(actuators.map((a) => a.name)).toEqual(['DO0', 'DO1', 'DO2']);
        actuators.forEach((actuator, index) => {
            expect(actuator.type).toBe(ActuatorType.COM);
            expect((actuator.config as ComActuatorConfigModel).deviceId).toBe(device._id);
            expect((actuator.config as ComActuatorConfigModel).actions).toEqual([{ commandId: template.deviceCommands[0]._id, channel: index }]);
        });
    });

    it('should create one MODULE cycle per COM actuator, with a single sequence referencing it', async () => {
        const template = WithPorts(DIGITAL_IO_TEMPLATE, 3);

        const { actuators, cycles } = await strategy.build({ device: CreateSlave(template), template });

        expect(cycles).toHaveLength(3);
        cycles.forEach((cycle, index) => {
            expect(isValidUuid(cycle._id)).toBe(true);
            expect(cycle.type).toBe(CycleType.MODULE);
            expect(cycle.modePriority.map((p) => p.mode)).toEqual(Object.values(ProcessMode));
            expect(cycle.sequences).toHaveLength(1);
            expect(cycle.sequences[0]).toMatchObject({
                cycleId: cycle._id,
                securityConfig: { maxDuration: 3_600_000 },
                moduleConfigs: [{ moduleId: actuators[index]._id }]
            });
        });
    });

    it('should let two slaves of the same model share the same digital output command', async () => {
        const template = WithPorts(DIGITAL_IO_TEMPLATE, 1);

        const first = await strategy.build({ device: CreateSlave(template, 'd1'), template });
        const second = await strategy.build({ device: CreateSlave(template, 'd2'), template });

        const [a, b] = [first.actuators[0].config, second.actuators[0].config] as ComActuatorConfigModel[];
        expect(a.actions[0].commandId).toBe(b.actions[0].commandId);
        expect(a.deviceId).not.toBe(b.deviceId);
    });

    it('should warn and create nothing when the model has no digital output command', async () => {
        const template = WithPorts({ ...DIGITAL_IO_TEMPLATE, deviceCommands: DIGITAL_IO_TEMPLATE.deviceCommands.slice(1) }, 2);

        const { actuators } = await strategy.build({ device: CreateSlave(template), template });

        expect(actuators).toEqual([]);
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });
});
