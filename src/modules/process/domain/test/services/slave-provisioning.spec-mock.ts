import { DeviceKind, SlaveTemplate } from '@process/domain/models/device.model';
import { DeviceCommandType } from '@process/domain/models/device-command.model';

export const MASTER_ID = '8d6f3fe2-af41-405b-9523-a0a6fb589b42';

export const DIGITAL_IO_TEMPLATE: SlaveTemplate = {
    _id: '5b0c1f0e-3a3e-4c2a-9a51-2f6d1b7e8c01',
    name: '8/IO IRRIGATION VALVES',
    description: '8/IO IRRIGATION VALVES',
    kind: DeviceKind.DIGITAL_IO_8_CH,
    device: { name: '8/IO IRRIGATION VALVES', description: '8/IO IRRIGATION VALVES' },
    deviceCommands: [
        {
            _id: 'c0000000-0000-4000-8000-000000000001', name: 'digital output request', blockId: 'outputs', operationId: 'set',
            types: [DeviceCommandType.SET]
        },
        {
            _id: 'c0000000-0000-4000-8000-000000000002', name: 'SET ALL TOGGLE MODE', blockId: 'outputModes', operationId: 'setAll',
            value: [2, 2, 2, 2, 2, 2, 2, 2], types: [DeviceCommandType.INIT]
        },
        {
            _id: 'c0000000-0000-4000-8000-000000000003', name: 'SWITCH ALL ON', blockId: 'allOutputs', operationId: 'set',
            value: 1, types: [DeviceCommandType.INIT]
        }
    ]
};

// capteur TH : lecture monitoring (humidity + temperature autoCreate, params déjà résolus), lecture calibration sans autoCreate
export const TH_SENSOR_TEMPLATE: SlaveTemplate = {
    _id: '5b0c1f0e-3a3e-4c2a-9a51-2f6d1b7e8c02',
    name: 'TH SENSOR',
    kind: DeviceKind.TEMPERATURE_MOISTURE_V1,
    device: { name: 'TH SENSOR', description: 'TH SENSOR' },
    deviceCommands: [
        {
            _id: 'c0000000-0000-4000-8000-000000000011', name: 'Mesures', blockId: 'monitoring', operationId: 'read',
            types: [DeviceCommandType.READ],
            params: {
                isConfirmRequired: false, isPersistable: false,
                result: {
                    type: 'fields', fields: [
                        { name: 'humidity', label: 'Humidité', type: 'uint16', unit: '%RH', autoCreate: true },
                        { name: 'temperature', label: 'Température', type: 'int16', unit: '°C', autoCreate: true, description: 'Température air' }
                    ]
                }
            }
        },
        {
            _id: 'c0000000-0000-4000-8000-000000000012', name: 'Calibration', blockId: 'calibration', operationId: 'read',
            types: [DeviceCommandType.READ],
            params: {
                isConfirmRequired: false, isPersistable: false,
                result: { type: 'fields', fields: [{ name: 'temperatureCalibration', label: 'Calibration', type: 'int16' }] }
            }
        }
    ]
};

export function WithPorts(template: SlaveTemplate, portCount: number): SlaveTemplate {
    return { ...template, device: { ...template.device, portConfig: { portNumStart: 0, portCount } } };
}

// seul le bloc outputs du template DIGITAL_IO_8CH est un bloc de coils pilotable par voie
export function CreateDeviceCommandServiceMock(): { isDigitalOutputOf: jest.Mock; withParams: jest.Mock; withTemplateParams: jest.Mock } {
    return {
        isDigitalOutputOf: jest.fn((_kind: string, command: { blockId: string }) => command.blockId === 'outputs'),
        withParams: jest.fn((commands: unknown) => Promise.resolve(commands)),
        // params des templates de test déjà résolus
        withTemplateParams: jest.fn((template: SlaveTemplate) => template)
    };
}

export function CreateLoggerMock(): { log: jest.Mock; warn: jest.Mock; error: jest.Mock } {
    return { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
}
