import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DeviceCommandService } from '@process/domain/services/device-command.service';
import { StructureService } from '@process/domain/services/configuration.service';
import { SynchronizeService } from '@process/domain/services/synchronize.service';
import { BuildInverterParameters } from '@process/domain/services/slave-provisioning/auto-creation/strategies/inverter-auto-creation.strategy';
import { VEICHI_SI23_PROFILE } from '@process/domain/services/inverter/profiles/veichi-si23.profile';
import { DeviceKind, DeviceModel, DeviceType, SlaveTemplate } from '@process/domain/models/device.model';
import { InverterModel, InverterParameterModel } from '@process/domain/models/inverter.model';
import { BoxErrorCode } from '@framework/errors/box-error';
import { RegisterMapTemplate } from '@register-map/domain/models/register-map.model';
import { RegisterMapService } from '@register-map/domain/services/register-map.service';

const REGISTER_MAP_PATH = join(__dirname, '../../../../register-map/register-maps/veichi-si23-inverter.json');
const MODEL_ID = 'model-si23';
const DEVICE_ID = 'slave-si23';

function LoadSi23(): RegisterMapTemplate {
    return JSON.parse(readFileSync(REGISTER_MAP_PATH, 'utf-8')) as RegisterMapTemplate;
}

function CreateDeviceCommandService(): DeviceCommandService {
    const logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
    return new DeviceCommandService(
        {} as never,
        {} as never,
        {} as never,
        new RegisterMapService({} as never, {} as never, {} as never),
        { loadFromDirectory: jest.fn().mockReturnValue([LoadSi23()]) } as never,
        { loadFromDirectory: jest.fn(), translate: jest.fn((t) => t), translateOutcome: jest.fn((_t, o) => o) } as never,
        {} as never,
        { language: 'fr' } as never,
        logger as never
    );
}

function CreateTemplate(service: DeviceCommandService): SlaveTemplate {
    return {
        _id: MODEL_ID, name: 'SI23', kind: DeviceKind.INVERTER_VEICHI_SI23_V1, device: { name: 'SI23', description: '' },
        deviceCommands: service.fromRegisterMap(MODEL_ID, service.getTemplate(DeviceKind.INVERTER_VEICHI_SI23_V1))
    } as SlaveTemplate;
}

function CreateInverter(parameters: InverterParameterModel[]): InverterModel {
    return Object.assign(new InverterModel(), {
        _id: 'inverter-1', name: 'SI23', deviceId: DEVICE_ID, profile: DeviceKind.INVERTER_VEICHI_SI23_V1, parameters
    });
}

describe('Inverter parameters', () => {
    let deviceCommandService: DeviceCommandService;
    let template: SlaveTemplate;
    let parameters: InverterParameterModel[];

    beforeEach(() => {
        deviceCommandService = CreateDeviceCommandService();
        template = CreateTemplate(deviceCommandService);
        parameters = BuildInverterParameters(VEICHI_SI23_PROFILE, deviceCommandService.withTemplateParams(template).deviceCommands);
    });

    describe('BuildInverterParameters', () => {
        it('should expose the AI1 / AI2 scaling and PID feedback parameters, without imposed value', () => {
            const exposed = ['F03.00', 'F03.01', 'F03.02', 'F03.03', 'F03.04', 'F03.06', 'F03.07', 'F03.08', 'F03.09', 'F03.10',
                'F03.19', 'F11.03', 'F11.05', 'F11.06', 'F11.26', 'F11.27', 'F11.28'];

            for (const blockId of exposed) {
                const parameter = parameters.find((p) => p.blockId === blockId);
                expect(parameter).toBeDefined();
                expect(parameter.value).toBeUndefined();
                expect(parameter.isPersistent).toBe(true);
            }
        });

        it('should take the profile baseline as initial value and cover every baseline block', () => {
            expect(parameters.find((p) => p.blockId === 'F00.09')?.value).toBe(5000);
            const missing = Object.keys(VEICHI_SI23_PROFILE.baseline).filter((blockId) => !parameters.some((p) => p.blockId === blockId));
            expect(missing).toEqual([]);
        });
    });

    describe('DeviceCommandService.checkValueOf', () => {
        const kind = DeviceKind.INVERTER_VEICHI_SI23_V1;

        it('should accept AI1 / AI2 as PID feedback source', () => {
            expect(() => deviceCommandService.checkValueOf(kind, { blockId: 'F11.03', operationId: 'set' }, 2)).not.toThrow();
            expect(() => deviceCommandService.checkValueOf(kind, { blockId: 'F11.03', operationId: 'set' }, 3)).not.toThrow();
        });

        it('should reject a value outside the enum', () => {
            expect(() => deviceCommandService.checkValueOf(kind, { blockId: 'F11.03', operationId: 'set' }, 99))
                .toThrow(expect.objectContaining({ code: BoxErrorCode.VALUE_NOT_IN_ENUM }));
        });

        it('should reject a number outside the set range', () => {
            expect(() => deviceCommandService.checkValueOf(kind, { blockId: 'F03.00', operationId: 'set' }, 5000))
                .toThrow(expect.objectContaining({ code: BoxErrorCode.VALUE_OUT_OF_RANGE }));
        });
    });

    describe('StructureService.completeInverterParameters', () => {
        let inverterRepository: { get: jest.Mock; save: jest.Mock };
        let service: StructureService;

        beforeEach(() => {
            const device = Object.assign(new DeviceModel(), {
                _id: DEVICE_ID, type: DeviceType.SLAVE, name: 'SI23',
                config: { slaveId: 1, masterDeviceId: 'master', kind: DeviceKind.INVERTER_VEICHI_SI23_V1, modelId: MODEL_ID }
            });
            inverterRepository = { get: jest.fn(), save: jest.fn((inverter) => Promise.resolve(inverter)) };
            service = new StructureService(
                {} as never, {} as never,
                { get: jest.fn().mockResolvedValue([device]) } as never,
                { get: jest.fn().mockResolvedValue([template]) } as never,
                {} as never, {} as never,
                deviceCommandService,
                {} as never, {} as never, {} as never,
                inverterRepository as never,
                {} as never, {} as never
            );
        });

        it('should add the missing parameters and keep the values already set', async () => {
            const f0009 = parameters.find((p) => p.blockId === 'F00.09');
            const inverter = CreateInverter([{ ...f0009, value: 4800 }]);
            inverterRepository.get.mockResolvedValue([inverter]);

            const updated = await service.completeInverterParameters();

            expect(updated).toHaveLength(1);
            expect(inverterRepository.save).toHaveBeenCalledTimes(1);
            const saved = inverterRepository.save.mock.calls[0][0] as InverterModel;
            expect(saved.parameters).toHaveLength(parameters.length);
            expect(saved.parameters.find((p) => p.blockId === 'F00.09').value).toBe(4800);
            expect(saved.parameters.find((p) => p.blockId === 'F11.03').value).toBeUndefined();
            expect(saved.parameters.find((p) => p.blockId === 'F00.11').value).toBe(4000);
        });

        it('should not save an inverter already up to date', async () => {
            inverterRepository.get.mockResolvedValue([CreateInverter(parameters.map((p) => ({ ...p })))]);

            const updated = await service.completeInverterParameters();

            expect(updated).toEqual([]);
            expect(inverterRepository.save).not.toHaveBeenCalled();
        });
    });

    describe('SynchronizeService.synchronizeInverter', () => {
        let inverterRepository: { get: jest.Mock; save: jest.Mock };
        let service: SynchronizeService;

        beforeEach(() => {
            inverterRepository = {
                get: jest.fn().mockResolvedValue(CreateInverter(parameters.map((p) => ({ ...p })))),
                save: jest.fn((inverter) => Promise.resolve(inverter))
            };
            const args: unknown[] = new Array(18).fill({});
            args[7] = { refreshInverters: jest.fn() };
            args[13] = deviceCommandService;
            args[16] = inverterRepository;
            service = new (SynchronizeService as unknown as new (...a: unknown[]) => SynchronizeService)(...args);
        });

        it('should store the PID feedback switch to AI2 and clear an imposed value with null', async () => {
            const saved = await service.synchronizeInverter({
                _id: 'inverter-1', parameters: [{ blockId: 'F11.03', value: 3 }, { blockId: 'F00.09', value: null }]
            });

            expect(saved.parameters.find((p) => p.blockId === 'F11.03').value).toBe(3);
            expect(saved.parameters.find((p) => p.blockId === 'F00.09').value).toBeUndefined();
        });

        it('should reject an out of range value without saving', async () => {
            await expect(service.synchronizeInverter({ _id: 'inverter-1', parameters: [{ blockId: 'F03.02', value: 5000 }] }))
                .rejects.toMatchObject({ code: BoxErrorCode.VALUE_OUT_OF_RANGE });
            expect(inverterRepository.save).not.toHaveBeenCalled();
        });
    });
});
