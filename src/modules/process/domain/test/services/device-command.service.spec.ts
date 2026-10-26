import { DeviceCommandService } from '@process/domain/services/device-command.service';
import { ModbusDeviceService } from '@process/domain/services/modbus-device.service';
import { DeviceCommandModel, DeviceCommandType } from '@process/domain/models/device-command.model';
import { DeviceKind, DeviceModel, DeviceType, MasterConfigModel, MasterProtocol, SlaveConfigModel, SlaveTemplate } from '@process/domain/models/device.model';
import { RegisterMapNotFoundError } from '@register-map/domain/errors/register-map.error';
import { ModbusTransport } from '@register-map/domain/models/modbus-connection.model';
import { RegisterFunction, RegisterMapTemplate } from '@register-map/domain/models/register-map.model';
import { RegisterMapService } from '@register-map/domain/services/register-map.service';

function CreateTemplate(): RegisterMapTemplate {
    return {
        kind: DeviceKind.DIGITAL_IO_8_CH,
        schemaVersion: 1,
        hardware: { manufacturer: 'Waveshare', model: 'IO 8CH' },
        enums: {},
        registerMap: [
            {
                id: 'outputs', label: 'Sorties', area: 'coil', access: 'rw', address: { start: 0, count: 8 },
                operations: [{ id: 'set', label: 'Set', function: RegisterFunction.WRITE_SINGLE_COIL, fc: 5, scope: 'channel' }]
            },
            {
                id: 'analog', label: 'Consignes', area: 'holdingRegister', access: 'rw', address: { start: 0, count: 8 },
                operations: [{ id: 'set', label: 'Set', function: RegisterFunction.WRITE_SINGLE_REGISTER, fc: 6, scope: 'channel', input: { type: 'number', min: 0, max: 10000 } }]
            }
        ]
    };
}

function CreateDevice(_id: string, type: DeviceType, config: MasterConfigModel | SlaveConfigModel): DeviceModel {
    return Object.assign(new DeviceModel(), { _id, type, name: _id, description: '', config });
}

function CreateModel(_id: string, kind: DeviceKind): SlaveTemplate {
    return { _id, name: _id, kind, device: { name: _id, description: '' }, deviceCommands: [] };
}

function CreateCommand(overrides: Partial<DeviceCommandModel> = {}): DeviceCommandModel {
    return Object.assign(new DeviceCommandModel(), {
        _id: 'cmd-1', modelId: 'model-1', name: 'DO', blockId: 'outputs', operationId: 'set', types: [DeviceCommandType.SET],
        channel: 0, value: 0, ...overrides
    });
}

describe('DeviceCommandService', () => {
    let devices: Record<string, DeviceModel>;
    let deviceCommandRepository: { get: jest.Mock; getByIds: jest.Mock; getCommandsByType: jest.Mock; save: jest.Mock };
    let deviceRepository: { get: jest.Mock; save: jest.Mock };
    let slaveTemplateRepository: { get: jest.Mock };
    let registerMapService: RegisterMapService;
    let registerMapLoader: { loadFromDirectory: jest.Mock };
    let waveshareDiscoveryService: { refreshMasterAddress: jest.Mock };
    let logger: { error: jest.Mock; warn: jest.Mock };
    let service: DeviceCommandService;

    beforeEach(() => {
        const master = { protocol: MasterProtocol.TCP, ipAddress: '192.168.1.26', port: 4196, timeout: 1500, deviceId: 'WS-1' } as MasterConfigModel;
        devices = {
            'master-1': CreateDevice('master-1', DeviceType.MASTER, master),
            'slave-1': CreateDevice('slave-1', DeviceType.SLAVE, { slaveId: 62, masterDeviceId: 'master-1', kind: DeviceKind.DIGITAL_IO_8_CH, modelId: 'model-1' }),
            'slave-2': CreateDevice('slave-2', DeviceType.SLAVE, { slaveId: 63, masterDeviceId: 'master-1', kind: DeviceKind.DIGITAL_IO_8_CH, modelId: 'model-1' }),
            'other-slave': CreateDevice('other-slave', DeviceType.SLAVE, { slaveId: 64, masterDeviceId: 'master-1', kind: DeviceKind.DIGITAL_IO_8_CH, modelId: 'model-2' })
        };
        deviceCommandRepository = { get: jest.fn().mockResolvedValue(CreateCommand()), getByIds: jest.fn().mockResolvedValue([]), getCommandsByType: jest.fn().mockResolvedValue([]), save: jest.fn() };
        deviceRepository = { get: jest.fn((id: string) => Promise.resolve(devices[id] ?? null)), save: jest.fn() };
        slaveTemplateRepository = { get: jest.fn().mockResolvedValue([CreateModel('model-1', DeviceKind.DIGITAL_IO_8_CH)]) };
        registerMapService = new RegisterMapService({} as never, {} as never, {} as never);
        jest.spyOn(registerMapService, 'execute').mockResolvedValue({ isOk: true } as never);
        registerMapLoader = { loadFromDirectory: jest.fn().mockReturnValue([CreateTemplate()]) };
        waveshareDiscoveryService = { refreshMasterAddress: jest.fn() };
        logger = { error: jest.fn(), warn: jest.fn() };
        service = new DeviceCommandService(
            deviceCommandRepository as never,
            deviceRepository as never,
            slaveTemplateRepository as never,
            registerMapService,
            registerMapLoader as never,
            new ModbusDeviceService({} as never, waveshareDiscoveryService as never, logger as never),
            logger as never
        );
    });

    describe('execute', () => {
        it('should run the command on the slave template, with the master TCP connection', async () => {
            await service.execute('cmd-1', 'slave-1');

            expect(deviceCommandRepository.get).toHaveBeenCalledWith('cmd-1');
            expect(registerMapService.execute).toHaveBeenCalledWith(
                expect.objectContaining({ kind: DeviceKind.DIGITAL_IO_8_CH }),
                expect.objectContaining({ transport: ModbusTransport.TCP, host: '192.168.1.26', port: 4196, unitId: 62, timeout: 1500 }),
                { blockId: 'outputs', operationId: 'set', channel: 0, value: 0, isPersistent: undefined, isConfirmed: undefined }
            );
        });

        it('should apply the override, ignoring undefined values', async () => {
            await service.execute(CreateCommand({ channel: 5 }), 'slave-1', { channel: undefined, value: 1 });

            expect(deviceCommandRepository.get).not.toHaveBeenCalled();
            expect(registerMapService.execute).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ channel: 5, value: 1 }));
        });

        it('should build an RTU connection for an RTU master', async () => {
            devices['master-1'].config = { protocol: MasterProtocol.RTU, path: '/dev/ttyUSB0', baudRate: 4800 } as MasterConfigModel;

            await service.execute('cmd-1', 'slave-1');

            expect(registerMapService.execute).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ transport: ModbusTransport.RTU, path: '/dev/ttyUSB0', baudRate: 4800, unitId: 62 }),
                expect.anything()
            );
        });

        it('should give a refreshed connection on unreachable master when its ip changed, undefined otherwise', async () => {
            await service.execute('cmd-1', 'slave-1');
            const connection = (registerMapService.execute as jest.Mock).mock.calls[0][1];

            waveshareDiscoveryService.refreshMasterAddress.mockImplementation(async (config: MasterConfigModel) => {
                config.ipAddress = '192.168.1.99';
                return true;
            });
            await expect(connection.onUnreachable()).resolves.toEqual(expect.objectContaining({ host: '192.168.1.99', unitId: 62 }));

            waveshareDiscoveryService.refreshMasterAddress.mockResolvedValue(false);
            await expect(connection.onUnreachable()).resolves.toBeUndefined();
        });

        it('should load the templates only once', async () => {
            await service.execute('cmd-1', 'slave-1');
            await service.execute('cmd-1', 'slave-1');

            expect(registerMapLoader.loadFromDirectory).toHaveBeenCalledTimes(1);
        });

        it('should reject an unknown command, a slave without kind or a missing master', async () => {
            deviceCommandRepository.get.mockResolvedValueOnce(null);
            await expect(service.execute('missing', 'slave-1')).rejects.toBeInstanceOf(RegisterMapNotFoundError);

            (devices['slave-1'].config as SlaveConfigModel).kind = undefined;
            await expect(service.execute('cmd-1', 'slave-1')).rejects.toBeInstanceOf(RegisterMapNotFoundError);

            (devices['slave-1'].config as SlaveConfigModel).kind = DeviceKind.DIGITAL_IO_8_CH;
            delete devices['master-1'];
            await expect(service.execute('cmd-1', 'slave-1')).rejects.toBeInstanceOf(RegisterMapNotFoundError);
        });

        it('should share the command between the slaves of its model, each with its own connection', async () => {
            await service.execute('cmd-1', 'slave-1');
            await service.execute('cmd-1', 'slave-2');

            const unitIds = (registerMapService.execute as jest.Mock).mock.calls.map(([, connection]) => connection.unitId);
            expect(unitIds).toEqual([62, 63]);
        });

        it('should reject a slave of another model', async () => {
            await expect(service.execute('cmd-1', 'other-slave')).rejects.toThrow('non exécutable sur le slave other-slave');
            expect(registerMapService.execute).not.toHaveBeenCalled();
        });

        it('should reject a kind without register map', async () => {
            (devices['slave-1'].config as SlaveConfigModel).kind = DeviceKind.PRESSURE_V1;

            await expect(service.execute('cmd-1', 'slave-1')).rejects.toThrow(`Aucune register map pour le kind ${DeviceKind.PRESSURE_V1}`);
        });
    });

    describe('read', () => {
        const FIELDS = {
            isOk: true, blockId: 'monitoring', operationId: 'read',
            value: { type: 'fields', fields: [
                { name: 'pv', label: 'Mesure', raw: 1234, value: 12.34, unit: 'bar' },
                { name: 'unit', label: 'Unité', raw: 1, value: 1 }
            ] }
        };

        beforeEach(() => {
            (registerMapService.execute as jest.Mock).mockResolvedValue(FIELDS);
        });

        it('should keep only the fields selected on the command', async () => {
            deviceCommandRepository.get.mockResolvedValue(CreateCommand({ fields: ['pv'] }));

            expect(await service.read('cmd-1', 'slave-1')).toEqual([{ name: 'pv', value: 12.34, unit: 'bar' }]);
        });

        it('should return every numeric field without selection, and let the given fields override the command ones', async () => {
            expect((await service.read('cmd-1', 'slave-1')).map((v) => v.name)).toEqual(['pv', 'unit']);

            deviceCommandRepository.get.mockResolvedValue(CreateCommand({ fields: ['pv'] }));
            expect((await service.read('cmd-1', 'slave-1', ['unit'])).map((v) => v.name)).toEqual(['unit']);
        });

        it('should throw when the read failed', async () => {
            (registerMapService.execute as jest.Mock)
                .mockResolvedValue({ isOk: false, blockId: 'monitoring', operationId: 'read', error: { message: 'Timed out' } });

            await expect(service.read('cmd-1', 'slave-1')).rejects.toThrow('monitoring.read : Timed out');
        });
    });

    describe('executeOnDevice', () => {
        it('should run the operation on the slave template and connection, without saved command', async () => {
            const operation = { blockId: 'analog', operationId: 'set', channel: 2, value: 5000 };

            await service.executeOnDevice('slave-1', operation);

            expect(deviceCommandRepository.get).not.toHaveBeenCalled();
            expect(registerMapService.execute).toHaveBeenCalledWith(
                expect.objectContaining({ kind: DeviceKind.DIGITAL_IO_8_CH }),
                expect.objectContaining({ host: '192.168.1.26', unitId: 62 }),
                operation
            );
        });

        it('should reject an unknown slave', async () => {
            await expect(service.executeOnDevice('missing', { blockId: 'outputs', operationId: 'set' })).rejects.toBeInstanceOf(RegisterMapNotFoundError);
        });
    });

    describe('templates', () => {
        it('should list every register map and resolve the one of a slave', async () => {
            expect(service.listTemplates().map((t) => t.kind)).toEqual([DeviceKind.DIGITAL_IO_8_CH]);
            await expect(service.getTemplateByDevice('slave-1')).resolves.toEqual(expect.objectContaining({ kind: DeviceKind.DIGITAL_IO_8_CH }));
        });
    });

    describe('runInitCommands', () => {
        const init = (id: string): DeviceCommandModel => CreateCommand({ _id: id, types: [DeviceCommandType.INIT], value: 1 });
        // initDoneCommandIds au moment de chaque sauvegarde du slave (le même objet est muté)
        let saved: string[][];
        const savedDone = (): string[][] => saved;

        beforeEach(() => {
            saved = [];
            deviceRepository.save.mockImplementation((d: DeviceModel) => saved.push([...(d.config as SlaveConfigModel).initDoneCommandIds]));
        });
        const commandsByType = (commands: Partial<Record<DeviceCommandType, DeviceCommandModel[]>>): void => {
            deviceCommandRepository.getCommandsByType.mockImplementation((_, type: DeviceCommandType) => Promise.resolve(commands[type] ?? []));
        };

        it('should execute, in order, the model init commands not yet applied on the slave and mark them as applied on it', async () => {
            commandsByType({ [DeviceCommandType.INIT]: [init('a'), init('b'), init('c')] });
            (devices['slave-1'].config as SlaveConfigModel).initDoneCommandIds = ['b'];

            await service.runInitCommands('slave-1');

            expect(deviceCommandRepository.getCommandsByType).toHaveBeenCalledWith('model-1', DeviceCommandType.INIT);
            expect((registerMapService.execute as jest.Mock).mock.calls).toHaveLength(2);
            expect(savedDone()).toEqual([['b', 'a'], ['b', 'a', 'c']]);
            expect(deviceCommandRepository.save).not.toHaveBeenCalled();
        });

        it('should track the applied init commands per slave', async () => {
            commandsByType({ [DeviceCommandType.INIT]: [init('a')] });

            await service.runInitCommands('slave-1');
            await service.runInitCommands('slave-2');
            await service.runInitCommands('slave-1');

            expect((registerMapService.execute as jest.Mock).mock.calls.map(([, connection]) => connection.unitId)).toEqual([62, 63]);
            expect((devices['slave-1'].config as SlaveConfigModel).initDoneCommandIds).toEqual(['a']);
            expect((devices['slave-2'].config as SlaveConfigModel).initDoneCommandIds).toEqual(['a']);
        });

        it('should skip, with a warning, a slave not attached to a model', async () => {
            (devices['slave-1'].config as SlaveConfigModel).modelId = undefined;

            await service.runInitCommands('slave-1');
            await service.runResetCommands('slave-1');

            expect(deviceCommandRepository.getCommandsByType).not.toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalledWith({ deviceId: 'slave-1' }, 'slave without modelId, device commands skipped');
        });

                it('should leave a command not applied when the modbus operation failed, and continue', async () => {
            commandsByType({ [DeviceCommandType.INIT]: [init('a'), init('b')] });
            (registerMapService.execute as jest.Mock).mockResolvedValueOnce({ isOk: false });

            await service.runInitCommands('slave-1');

            expect(savedDone()).toEqual([['b']]);
        });

        it('should log and continue when a command cannot be resolved', async () => {
            commandsByType({ [DeviceCommandType.INIT]: [init('a'), init('b')] });
            (registerMapService.execute as jest.Mock).mockRejectedValueOnce(new Error('channel invalide'));

            await service.runInitCommands('slave-1');

            expect(logger.error).toHaveBeenCalledWith(
                expect.objectContaining({ commandId: 'a', types: [DeviceCommandType.INIT], err: 'channel invalide' }), 'device command failed');
            expect(savedDone()).toEqual([['b']]);
        });
    });

    describe('runResetCommands', () => {
        const command = (id: string, type: DeviceCommandType): DeviceCommandModel => CreateCommand({ _id: id, types: [type], value: 1 });

        beforeEach(() => {
            const reset = [command('r1', DeviceCommandType.RESET), command('r2', DeviceCommandType.RESET)];
            const init = [command('a', DeviceCommandType.INIT), command('b', DeviceCommandType.INIT)];
            (devices['slave-1'].config as SlaveConfigModel).initDoneCommandIds = ['a', 'b'];
            (devices['slave-2'].config as SlaveConfigModel).initDoneCommandIds = ['a', 'b'];
            deviceCommandRepository.getCommandsByType.mockImplementation((_, type: DeviceCommandType) =>
                Promise.resolve(type === DeviceCommandType.RESET ? reset : init));
        });

        it('should execute every reset command, then re-apply every init command of the slave only', async () => {
            const execute = jest.spyOn(service, 'execute');
            const saved: string[][] = [];
            deviceRepository.save.mockImplementation((d: DeviceModel) => saved.push([...(d.config as SlaveConfigModel).initDoneCommandIds]));

            await service.runResetCommands('slave-1');

            expect(execute.mock.calls.map(([c, deviceId]) => [(c as DeviceCommandModel)._id, deviceId])).toEqual(
                [['r1', 'slave-1'], ['r2', 'slave-1'], ['a', 'slave-1'], ['b', 'slave-1']]);
            expect(deviceCommandRepository.getCommandsByType).toHaveBeenCalledWith('model-1', DeviceCommandType.RESET);
            expect(saved).toEqual([[], ['a'], ['a', 'b']]);
            expect((devices['slave-2'].config as SlaveConfigModel).initDoneCommandIds).toEqual(['a', 'b']);
        });

        it('should log a failed reset command and continue', async () => {
            (registerMapService.execute as jest.Mock).mockRejectedValueOnce(new Error('timeout'));

            await service.runResetCommands('slave-1');

            expect(logger.error).toHaveBeenCalledWith(
                expect.objectContaining({ commandId: 'r1', types: [DeviceCommandType.RESET], err: 'timeout' }), 'device command failed');
            expect(registerMapService.execute).toHaveBeenCalledTimes(4);
        });
    });

    describe('actuator actions by type', () => {
        const actions = [{ commandId: 'set', channel: 1 }, { commandId: 'init-reset', channel: 2 }, { commandId: 'init', channel: 3 }];

        beforeEach(() => {
            // ordre volontairement différent de `actions` : le résultat suit l'ordre des actions
            deviceCommandRepository.getByIds.mockResolvedValue([
                CreateCommand({ _id: 'init', types: [DeviceCommandType.INIT], value: 1 }),
                CreateCommand({ _id: 'set', types: [DeviceCommandType.SET] }),
                CreateCommand({ _id: 'init-reset', types: [DeviceCommandType.INIT, DeviceCommandType.RESET], value: 0 }),
            ]);
        });

        it('should keep, in action order, only the actions whose command has the requested type', async () => {
            const init = await service.actionsOfType(actions, DeviceCommandType.INIT);
            const reset = await service.actionsOfType(actions, DeviceCommandType.RESET);

            expect(deviceCommandRepository.getByIds).toHaveBeenCalledWith(['set', 'init-reset', 'init']);
            expect(init.map(({ command }) => command._id)).toEqual(['init-reset', 'init']);
            expect(reset.map(({ action }) => action.channel)).toEqual([2]);
        });

        it('should not query the repository without actions', async () => {
            await expect(service.actionsOfType(undefined, DeviceCommandType.SET)).resolves.toEqual([]);
            expect(deviceCommandRepository.getByIds).not.toHaveBeenCalled();
        });

        it('should run the matching commands on the channel of their action, with the given value', async () => {
            const execute = jest.spyOn(service, 'execute');

            await service.runActions('slave-2', actions, DeviceCommandType.SET, 1);

            expect(execute).toHaveBeenCalledTimes(1);
            expect(execute).toHaveBeenCalledWith(expect.objectContaining({ _id: 'set' }), 'slave-2', { channel: 1, value: 1 });
        });

        it('should log a failed command and continue with the next ones', async () => {
            (registerMapService.execute as jest.Mock).mockRejectedValueOnce(new Error('timeout'));

            const outcomes = await service.runActions('slave-1', actions, DeviceCommandType.INIT);

            expect(outcomes).toHaveLength(1);
            expect(logger.error).toHaveBeenCalledWith(
                expect.objectContaining({ deviceId: 'slave-1', commandId: 'init-reset', type: DeviceCommandType.INIT, err: 'timeout' }), 'device command failed');
        });
    });

    describe('isDigitalOutput', () => {
        it('should be true for a coil block and false otherwise', async () => {
            await expect(service.isDigitalOutput('cmd-1', 'slave-1')).resolves.toBe(true);

            deviceCommandRepository.get.mockResolvedValue(CreateCommand({ blockId: 'analog' }));
            await expect(service.isDigitalOutput('cmd-1', 'slave-1')).resolves.toBe(false);
        });

        it('should work from the kind alone, without a saved device', () => {
            expect(service.isDigitalOutputOf(DeviceKind.DIGITAL_IO_8_CH, { blockId: 'outputs', operationId: 'set' })).toBe(true);
            expect(service.isDigitalOutputOf(DeviceKind.DIGITAL_IO_8_CH, { blockId: 'analog', operationId: 'set' })).toBe(false);
        });
    });

    describe('numberRange', () => {
        it('should return the numeric input range of the operation, undefined when not numeric', async () => {
            await expect(service.numberRange('cmd-1', 'slave-1')).resolves.toBeUndefined();

            deviceCommandRepository.get.mockResolvedValue(CreateCommand({ blockId: 'analog' }));
            await expect(service.numberRange('cmd-1', 'slave-1')).resolves.toEqual({ min: 0, max: 10000 });
        });
    });

    describe('withParams', () => {
        it('should add the operation params from the template of the model kind, without mutating the command', async () => {
            const command = CreateCommand({ blockId: 'analog' });

            const [result] = await service.withParams([command], [CreateModel('model-1', DeviceKind.DIGITAL_IO_8_CH)]);

            expect(result.params).toEqual(expect.objectContaining({
                channel: { min: 0, max: 7, labelStart: 1 },
                value: { type: 'number', min: 0, max: 10000 }
            }));
            expect(command.params).toBeUndefined();
        });

        it('should load the models when not given', async () => {
            const [result] = await service.withParams([CreateCommand()]);

            expect(slaveTemplateRepository.get).toHaveBeenCalled();
            expect(result.params?.channel).toEqual({ min: 0, max: 7, labelStart: 1 });
        });

        it('should return the command without params when its kind or operation is unknown', async () => {
            const unknownModel = CreateCommand({ _id: 'cmd-2', modelId: 'ghost' });
            const unknownOperation = CreateCommand({ _id: 'cmd-3', operationId: 'nope' });

            const results = await service.withParams([unknownModel, unknownOperation], [CreateModel('model-1', DeviceKind.DIGITAL_IO_8_CH)]);

            expect(results.map((r) => r.params)).toEqual([undefined, undefined]);
            expect(logger.warn).toHaveBeenCalledTimes(2);
        });
    });

    describe('withTemplateParams', () => {
        it('should add the params to each command of the template from its kind', () => {
            const { modelId, ...command } = CreateCommand({ blockId: 'analog' });
            const template = { ...CreateModel('model-1', DeviceKind.DIGITAL_IO_8_CH), deviceCommands: [command, { ...command, _id: 'cmd-2', operationId: 'nope' }] };

            const result = service.withTemplateParams(template);

            expect(result.deviceCommands[0].params).toEqual(expect.objectContaining({
                channel: { min: 0, max: 7, labelStart: 1 },
                value: { type: 'number', min: 0, max: 10000 }
            }));
            expect(result.deviceCommands[1].params).toBeUndefined();
            expect(template.deviceCommands[0].params).toBeUndefined();
            expect(modelId).toBe('model-1');
        });
    });

    describe('fromRegisterMap', () => {
        it('should create one command per operation, read or set according to the Modbus function', () => {
            const template = CreateTemplate();
            template.registerMap[1].operations[0].input = { type: 'number', min: 0, max: 10000, default: 4000 };
            template.registerMap.push({
                id: 'deviceAddress', label: 'Adresse', area: 'holdingRegister', access: 'rw', address: { start: 0x4000, count: 1 }, danger: true,
                operations: [{ id: 'read', label: 'Lire', function: RegisterFunction.READ_HOLDING_REGISTERS, fc: 3, scope: 'fixed', input: { type: 'none' } }]
            } as never);

            const commands = service.fromRegisterMap('model-1', template);

            expect(commands.map(({ name, blockId, operationId, channel, value, types, isConfirmed }) => ({ name, blockId, operationId, channel, value, types, isConfirmed }))).toEqual([
                { name: 'Sorties — Set', blockId: 'outputs', operationId: 'set', channel: 0, value: undefined, types: [DeviceCommandType.SET], isConfirmed: false },
                { name: 'Consignes — Set', blockId: 'analog', operationId: 'set', channel: 0, value: 4000, types: [DeviceCommandType.SET], isConfirmed: false },
                { name: 'Adresse — Lire', blockId: 'deviceAddress', operationId: 'read', channel: undefined, value: undefined, types: [DeviceCommandType.READ], isConfirmed: false }
            ]);
        });

        it('should derive stable UUIDs from the model, block and operation', () => {
            const ids = service.fromRegisterMap('model-1', CreateTemplate()).map((command) => command._id);

            expect(service.fromRegisterMap('model-1', CreateTemplate()).map((command) => command._id)).toEqual(ids);
            expect(service.fromRegisterMap('model-2', CreateTemplate()).map((command) => command._id)).not.toEqual(ids);
            expect(new Set(ids).size).toBe(2);
            ids.forEach((id) => expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/));
        });
    });
});
