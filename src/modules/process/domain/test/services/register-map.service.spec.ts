import { BadRequestException } from '@nestjs/common';
import { DeviceKind, DeviceModel, DeviceType } from '@process/domain/models/device.model';
import { ModbusFunctionName } from '@process/domain/models/com-request.model';
import { RegisterMapTemplate } from '@process/domain/models/register-map.model';
import { ModbusService } from '@process/domain/services/modbus.service';
import { RegisterMapService } from '@process/domain/services/register-map.service';
import { RegisterMapValidator } from '@process/domain/utils/register-map.util';

function CreateLoggerMock(): { log: jest.Mock; debug: jest.Mock; warn: jest.Mock; error: jest.Mock } {
    return { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

// Mots Modbus d'une valeur 32 bits, mot de poids faible en premier (wordOrder lowFirst)
function LowFirst(write: (b: Buffer) => void): number[] {
    const buffer = Buffer.alloc(4);
    write(buffer);
    return [buffer.readUInt16BE(2), buffer.readUInt16BE(0)];
}

function CreateSlave(kind: DeviceKind): DeviceModel {
    const device = new DeviceModel();
    device._id = 'slave-1';
    device.type = DeviceType.SLAVE;
    device.config = { masterDeviceId: 'master-1', slaveId: 61, kind } as DeviceModel['config'];
    return device;
}

describe('RegisterMapService', () => {
    const formulas = new ModbusService({} as any, {} as any, {} as any, CreateLoggerMock() as any);
    let modbusService: { executeRegisterRequest: jest.Mock; evaluateScale: jest.Mock };
    let deviceRepository: { get: jest.Mock };
    let service: RegisterMapService;
    let io8: RegisterMapTemplate;

    beforeEach(() => {
        modbusService = {
            executeRegisterRequest: jest.fn().mockResolvedValue(undefined),
            // Vrai moteur mathjs restreint de ModbusService (formules des templates)
            evaluateScale: jest.fn().mockImplementation((formula: string, scope: Record<string, number>) => formulas.evaluateScale(formula, scope))
        };
        deviceRepository = { get: jest.fn().mockResolvedValue(CreateSlave(DeviceKind.DIGITAL_IO_8_CH)) };
        service = new RegisterMapService(modbusService as any, deviceRepository as any, CreateLoggerMock() as any);
        io8 = service.getByKind(DeviceKind.DIGITAL_IO_8_CH);
    });

    it('should load a valid Waveshare IO 8CH register map from register-maps/', () => {
        expect(RegisterMapValidator.validate(io8)).toEqual([]);
        expect(io8.registerMap.map((b) => b.id)).toEqual(
            ['outputs', 'allOutputs', 'flashOn', 'flashOff', 'inputs', 'outputModes', 'uart', 'deviceAddress', 'version']
        );
    });

    it('should report inconsistencies of a template', () => {
        const broken = JSON.parse(JSON.stringify(io8)) as RegisterMapTemplate;
        broken.registerMap[0].operations[0].function = 'nope' as ModbusFunctionName;
        delete broken.enums.outputMode;
        expect(RegisterMapValidator.validate(broken)).toEqual(expect.arrayContaining([
            'outputs.read: fonction "nope" inconnue',
            'outputModes.read: enum "outputMode" absent'
        ]));
    });

    describe('buildRequest', () => {
        it.each([
            ['outputs', 'read', {}, { function: 'readCoils', address: 0, length: 8 }],
            ['outputs', 'set', { channel: 2, value: 1 }, { function: 'writeCoil', address: 2, length: 1, value: 1 }],
            ['outputs', 'toggle', { channel: 0 }, { function: 'customCoil', address: 0, length: 1, value: 0x5500 }],
            ['outputs', 'setMask', { value: [1, 1, 0, 0, 0, 0, 0, 0] },
                { function: 'writeCoils', address: 0, length: 8, value: [true, true, false, false, false, false, false, false] }],
            ['outputs', 'toggleRange', {}, { function: 'customCoils', address: 0, length: 8, value: 0x5500 }],
            ['allOutputs', 'set', { value: 0 }, { function: 'writeCoil', address: 0x00FF, length: 1, value: 0 }],
            ['flashOn', 'pulse', { channel: 1, value: 8 }, { function: 'customCoil', address: 0x0201, length: 1, value: 8 }],
            ['flashOff', 'pulse', { channel: 0 }, { function: 'customCoil', address: 0x0400, length: 1, value: 5 }],
            ['inputs', 'read', {}, { function: 'readDiscreteInputs', address: 0, length: 8 }],
            ['outputModes', 'set', { channel: 1, value: 2 }, { function: 'writeRegister', address: 0x1001, length: 1, value: 2 }],
            ['outputModes', 'setAll', { value: [1, 1, 1, 1, 1, 1, 1, 1] },
                { function: 'writeRegisters', address: 0x1000, length: 8, value: [1, 1, 1, 1, 1, 1, 1, 1] }],
            ['uart', 'set', { value: { parity: 1, baudRate: 5 }, isConfirmed: true },
                { function: 'writeRegister', address: 0x2000, length: 1, value: 0x0105 }],
            ['uart', 'set', { isConfirmed: true }, { function: 'writeRegister', address: 0x2000, length: 1, value: 0x0001 }],
            ['deviceAddress', 'set', { value: 62, isConfirmed: true }, { function: 'writeRegister', address: 0x4000, length: 1, value: 62 }],
            ['version', 'read', {}, { function: 'readHoldingRegisters', address: 0x8000, length: 1 }]
        ])('%s.%s %j', (blockId, operationId, input, expected) => {
            expect(service.buildRequest(io8, { blockId, operationId, ...input })).toEqual(expected);
        });

        it.each([
            ['outputs', 'set', { value: 1 }, /channel/],
            ['outputs', 'set', { channel: 8, value: 1 }, /channel/],
            ['outputs', 'set', { channel: 0, value: 65280 }, /hors/],
            ['outputs', 'setMask', { value: [1, 0] }, /tableau de 8/],
            ['flashOn', 'pulse', { channel: 0, value: 40000 }, /entre 1 et 32767/],
            ['outputModes', 'set', { channel: 0, value: 9 }, /hors/],
            ['deviceAddress', 'set', { value: 2 }, /isConfirmed=true/]
        ])('should reject %s.%s %j', (blockId, operationId, input, message) => {
            expect(() => service.buildRequest(io8, { blockId, operationId, ...input })).toThrow(BadRequestException);
            expect(() => service.buildRequest(io8, { blockId, operationId, ...input })).toThrow(message);
        });
    });

    describe('execute', () => {
        it('should decode coils into numbered channels', async () => {
            modbusService.executeRegisterRequest.mockResolvedValue([true, false, true, false, false, false, false, false]);

            const outcome = await service.execute({ deviceId: 'slave-1', blockId: 'outputs', operationId: 'read' });

            expect(modbusService.executeRegisterRequest).toHaveBeenCalledWith('slave-1', { function: 'readCoils', address: 0, length: 8 });
            expect(outcome.isOk).toBe(true);
            expect(outcome.value).toEqual({
                type: 'boolean[]',
                channels: expect.arrayContaining([{ index: 0, number: 1, value: true }, { index: 1, number: 2, value: false }])
            });
        });

        it('should decode output modes with their labels', async () => {
            modbusService.executeRegisterRequest.mockResolvedValue([0, 1, 2, 3, 0, 0, 0, 0]);

            const outcome = await service.execute({ deviceId: 'slave-1', blockId: 'outputModes', operationId: 'read' });

            expect(outcome.value.type === 'enum[]' && outcome.value.channels.slice(0, 4).map((c) => c.label))
                .toEqual(['Normal', 'Linkage', 'Toggle', 'Edge trigger']);
        });

        it('should format the software version', async () => {
            modbusService.executeRegisterRequest.mockResolvedValue([200]);

            const outcome = await service.execute({ deviceId: 'slave-1', blockId: 'version', operationId: 'read' });

            expect(outcome.value).toEqual({ type: 'version', value: 2, text: 'V2.00' });
        });

        it('should return a Modbus exception in the outcome instead of throwing', async () => {
            modbusService.executeRegisterRequest.mockRejectedValue(Object.assign(new Error('Modbus exception 2'), { modbusCode: 2 }));

            const outcome = await service.execute({ deviceId: 'slave-1', blockId: 'outputs', operationId: 'toggle', channel: 3 });

            expect(outcome.isOk).toBe(false);
            expect(outcome.request).toEqual({ function: 'customCoil', address: 3, length: 1, value: 0x5500 });
            expect(outcome.error).toEqual({ message: 'Modbus exception 2', modbusCode: 2, label: 'Illegal data address' });
        });

        it('should reject a device without a register map', async () => {
            deviceRepository.get.mockResolvedValue(CreateSlave(DeviceKind.FLOWMETER_V1));

            await expect(service.execute({ deviceId: 'slave-1', blockId: 'outputs', operationId: 'read' })).rejects.toThrow(/Aucune register map/);
            expect(modbusService.executeRegisterRequest).not.toHaveBeenCalled();
        });
    });

    describe('ultrasonic water meter', () => {
        let meter: RegisterMapTemplate;

        beforeEach(() => {
            deviceRepository.get.mockResolvedValue(CreateSlave(DeviceKind.FLOWMETER_ULTRASONIC_V1));
            meter = service.getByKind(DeviceKind.FLOWMETER_ULTRASONIC_V1);
        });

        it('should load a valid register map whose discovery register matches DEVICE_KIND_SPECS', () => {
            expect(RegisterMapValidator.validate(meter)).toEqual([]);
            expect(meter.hardware.discoveryRegister).toBe(0x003D);
        });

        it('should address history blocks with the stride (REG0513 + 8 × index)', () => {
            expect(service.buildRequest(meter, { blockId: 'monthlyHistory', operationId: 'read', channel: 3 }))
                .toEqual({ function: 'readHoldingRegisters', address: 512 + 24, length: 8 });
        });

        it('should encode the calendar as 3 BCD words, low byte first', () => {
            const value = { second: 56, minute: 34, hour: 12, day: 20, month: 2, year: 16 };
            expect(service.buildRequest(meter, { blockId: 'calendar', operationId: 'set', value }))
                .toEqual({ function: 'writeRegisters', address: 52, length: 3, value: [0x3456, 0x2012, 0x1602] });
        });

        it('should reject an out of range BCD field', () => {
            expect(() => service.buildRequest(meter, { blockId: 'autoSave', operationId: 'set', value: { day: 5, hour: 24 } }))
                .toThrow(/entre 0 et 23/);
        });

        it('should check the test registers against their expected values', async () => {
            modbusService.executeRegisterRequest.mockResolvedValue([
                ...LowFirst((b) => b.writeFloatBE(361, 0)),
                ...LowFirst((b) => b.writeInt32BE(363348858, 0)),
                ...LowFirst((b) => b.writeInt32BE(-987654320, 0))
            ]);

            const outcome = await service.execute({ deviceId: 'slave-1', blockId: 'commTest', operationId: 'read' });

            expect(outcome.value.type === 'fields' && outcome.value.fields.map((f) => [f.value, f.isExpected])).toEqual([
                [361, true], [363348858, true], [-987654320, false]
            ]);
        });

        it('should scale totalizers with the decimal position read beforehand (scopeFrom)', async () => {
            const totals = Array.from({ length: 24 }, () => 0);
            totals.splice(0, 4, ...LowFirst((b) => b.writeInt32BE(123456789, 0)), ...LowFirst((b) => b.writeFloatBE(0.5, 0)));
            modbusService.executeRegisterRequest
                .mockResolvedValueOnce([0, 0, 2, 0, 0, 1]) // units : flowDecimal = 2
                .mockResolvedValueOnce(totals);

            const outcome = await service.execute({ deviceId: 'slave-1', blockId: 'totalizers', operationId: 'read' });

            expect(modbusService.executeRegisterRequest)
                .toHaveBeenNthCalledWith(1, 'slave-1', { function: 'readHoldingRegisters', address: 1436, length: 6 });
            expect(outcome.scope).toEqual(expect.objectContaining({ flowDecimal: 2, heatDecimal: 0 }));
            const positiveFlow = outcome.value.type === 'fields' && outcome.value.fields.find((f) => f.name === 'positiveFlow');
            expect(positiveFlow && positiveFlow.value).toBeCloseTo(12345678.95, 2);
        });

        it('should decode error bits, BCD date and ASCII version of the heat meter scenario', async () => {
            const words = Array.from({ length: 40 }, () => 0);
            words.splice(22, 2, 0x1001, 0x0000); // bits 0 et 12
            words.splice(24, 3, 0x3456, 0x2012, 0x1602);
            words.splice(36, 2, 0x5636, 0x3031); // "V601"
            modbusService.executeRegisterRequest.mockResolvedValue(words);

            const outcome = await service.execute({ deviceId: 'slave-1', blockId: 'heatMeter', operationId: 'read' });

            const fields = outcome.value.type === 'fields' ? outcome.value.fields : [];
            expect(fields.find((f) => f.name === 'errorCode').flags).toEqual(['Erreur intégrateur de chaleur', 'Tension batterie basse (< 3,2 V)']);
            expect(fields.find((f) => f.name === 'dateTime').text).toBe('2016-02-20 12:34:56');
            expect(fields.find((f) => f.name === 'softwareVersion').value).toBe('V601');
        });
    });
});
