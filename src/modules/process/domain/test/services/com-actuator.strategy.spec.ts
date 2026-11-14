import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { ActuatorActionConfig, ComActuatorConfigModel, ActuatorModel } from '@process/domain/models/actuator.model';
import { DeviceCommandType } from '@process/domain/models/device-command.model';
import { ComActuatorStrategy } from '@process/domain/services/actuator-strategies/com-actuator.strategy';

function CreateActuatorComModel(actions: ActuatorActionConfig[] = [{ commandId: 'cmd-set', channel: 3 }]): ActuatorModel {
    const actuator = new ActuatorModel();
    actuator._id = 'actuator-1';
    actuator.type = ActuatorType.COM;
    actuator.config = new ComActuatorConfigModel();
    actuator.config.deviceId = 'com-1';
    actuator.config.actions = actions;
    return actuator;
}

describe('ComActuatorStrategy', () => {
    // usages des commandes référencées par les actions de l'actionneur
    const commandTypes: Record<string, DeviceCommandType[]> = {
        'cmd-set': [DeviceCommandType.SET],
        'cmd-read': [DeviceCommandType.READ],
        'cmd-init-reset': [DeviceCommandType.INIT, DeviceCommandType.RESET],
    };
    let deviceCommandService: { execute: jest.Mock; actionsOfType: jest.Mock; runActions: jest.Mock };
    let strategy: ComActuatorStrategy;

    beforeEach(() => {
        deviceCommandService = {
            execute: jest.fn().mockResolvedValue({ isOk: true, blockId: 'outputs', operationId: 'read', value: { type: 'number', value: 1 } }),
            actionsOfType: jest.fn((actions: ActuatorActionConfig[], type: DeviceCommandType) => Promise.resolve(actions
                .filter((action) => commandTypes[action.commandId]?.includes(type))
                .map((action) => ({ action, command: { _id: action.commandId, types: commandTypes[action.commandId] } })))),
            runActions: jest.fn().mockResolvedValue([])
        };
        strategy = new ComActuatorStrategy(deviceCommandService as never);
    });

    it('should have the COM type', () => {
        expect(strategy.type).toEqual(ActuatorType.COM);
    });

    it('should run the set commands of its actions with the action as value', async () => {
        const actuator = CreateActuatorComModel();

        await strategy.set(actuator, 1);

        expect(deviceCommandService.runActions).toHaveBeenCalledWith('com-1', (actuator.config as ComActuatorConfigModel).actions, DeviceCommandType.SET, 1);
    });

    it('should run the init commands of its actions on init', async () => {
        const actuator = CreateActuatorComModel([{ commandId: 'cmd-set', channel: 3 }, { commandId: 'cmd-init-reset', channel: 3 }]);

        await expect(strategy.init(actuator)).resolves.toBeUndefined();

        expect(deviceCommandService.runActions).toHaveBeenCalledWith('com-1', (actuator.config as ComActuatorConfigModel).actions, DeviceCommandType.INIT);
    });

    describe('reset', () => {
        it('should run the reset commands of its actions when it has some', async () => {
            const actuator = CreateActuatorComModel([{ commandId: 'cmd-set', channel: 3 }, { commandId: 'cmd-init-reset', channel: 3 }]);

            await strategy.reset(actuator);

            expect(deviceCommandService.runActions).toHaveBeenCalledTimes(1);
            expect(deviceCommandService.runActions).toHaveBeenCalledWith('com-1', (actuator.config as ComActuatorConfigModel).actions, DeviceCommandType.RESET);
        });

        it('should fall back to set 0 when it has no reset command', async () => {
            const actuator = CreateActuatorComModel();

            await strategy.reset(actuator);

            expect(deviceCommandService.runActions).toHaveBeenCalledTimes(1);
            expect(deviceCommandService.runActions).toHaveBeenCalledWith('com-1', (actuator.config as ComActuatorConfigModel).actions, DeviceCommandType.SET, 0);
        });
    });

    describe('read', () => {
        it('should execute the read command of its actions on its channel and return the value', async () => {
            const actuator = CreateActuatorComModel([{ commandId: 'cmd-set', channel: 3 }, { commandId: 'cmd-read', channel: 3 }]);

            await expect(strategy.read(actuator)).resolves.toEqual(1);

            expect(deviceCommandService.execute).toHaveBeenCalledTimes(1);
            expect(deviceCommandService.execute).toHaveBeenCalledWith(expect.objectContaining({ _id: 'cmd-read' }), 'com-1', { channel: 3 });
        });

        it('should reject when it has no read command', async () => {
            await expect(strategy.read(CreateActuatorComModel())).rejects.toThrow('sans commande read');
            expect(deviceCommandService.execute).not.toHaveBeenCalled();
        });
    });
});
