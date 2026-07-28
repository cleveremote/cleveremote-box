import { SensorMapper } from '@process/infrastructure/schemas/mappers/sensor.mapper';
import { ComSensorConfigModel, ForcastSensorConfigModel, forcastDataName, SensorModel } from '@process/domain/models/sensor.model';
import { SensorType } from '@process/domain/interfaces/sensor.interface';
import { SensorDocument } from '@process/infrastructure/schemas/sensor.schema';

describe('SensorMapper', () => {
    it('should map a FORCAST document to a model with its config copied', () => {
        const document = {
            _id: 'sensor-1', name: 'sensor', description: 'd',
            style: { bgColor: 'a', fontColor: 'b', iconColor: { base: 'c', icon: 'd' } },
            type: SensorType.FORCAST,
            config: { cronPattern: '0 0 * * *', forcastData: forcastDataName.TEMPERATURE_2M_MAX }
        } as unknown as SensorDocument;

        const model = SensorMapper.mapToModel(document);

        expect(model).toEqual(expect.objectContaining({
            _id: 'sensor-1', name: 'sensor', type: SensorType.FORCAST
        }));
        expect(model.config).toEqual(expect.objectContaining({ cronPattern: '0 0 * * *', forcastData: forcastDataName.TEMPERATURE_2M_MAX }));
    });

    it('should map a COM model to a schema input with its config copied', () => {
        const model = Object.assign(new SensorModel(), {
            id: 'sensor-2', name: 'sensor', description: 'd', type: SensorType.COM,
            config: Object.assign(new ComSensorConfigModel(), { cronPattern: '*/30 * * * * *', comRequestId: 'request-1' })
        });

        const schema = SensorMapper.mapToSchema(model);

        expect(schema).toEqual(expect.objectContaining({ name: 'sensor', type: SensorType.COM }));
        expect(schema.config).toEqual(expect.objectContaining({ cronPattern: '*/30 * * * * *', comRequestId: 'request-1' }));
    });

    it('should map a child sensor document (parentId set) to a model with a code/scale/unit config', () => {
        const document = {
            _id: 'sensor-3', name: 'child sensor', description: 'd',
            style: { bgColor: 'a', fontColor: 'b', iconColor: { base: 'c', icon: 'd' } },
            type: SensorType.COM,
            parentId: 'sensor-parent',
            config: { code: 12, scale: 0.1, unit: 'V' }
        } as unknown as SensorDocument;

        const model = SensorMapper.mapToModel(document);

        expect(model.parentId).toEqual('sensor-parent');
        expect(model.config).toEqual(expect.objectContaining({ code: 12, scale: 0.1, unit: 'V' }));
    });

    it('should map a FORCAST SensorModel to a schema input with its config copied', () => {
        const model = Object.assign(new SensorModel(), {
            _id: 'sensor-forcast', name: 'sensor', description: 'd', type: SensorType.FORCAST,
            config: Object.assign(new ForcastSensorConfigModel(), { cronPattern: '0 0 * * *', forcastData: forcastDataName.TEMPERATURE_2M_MAX })
        });

        const schema = SensorMapper.mapToSchema(model);

        expect(schema).toEqual(expect.objectContaining({ name: 'sensor', type: SensorType.FORCAST }));
        expect(schema.config).toEqual(expect.objectContaining({ cronPattern: '0 0 * * *', forcastData: forcastDataName.TEMPERATURE_2M_MAX }));
    });

    it('should copy isEnabled/display from the document onto the model', () => {
        const document = {
            _id: 'sensor-5', name: 'sensor', description: 'd',
            style: { bgColor: 'a', fontColor: 'b', iconColor: { base: 'c', icon: 'd' } },
            type: SensorType.FORCAST, isEnabled: false, display: false,
            config: { cronPattern: '0 0 * * *', forcastData: forcastDataName.TEMPERATURE_2M_MAX }
        } as unknown as SensorDocument;

        const model = SensorMapper.mapToModel(document);

        expect(model.isEnabled).toBe(false);
        expect(model.display).toBe(false);
    });

    it('should default isEnabled/display to true on the schema input when the model leaves them undefined', () => {
        const model = Object.assign(new SensorModel(), {
            _id: 'sensor-6', name: 'sensor', description: 'd', type: SensorType.COM,
            isEnabled: undefined, display: undefined,
            config: Object.assign(new ComSensorConfigModel(), { cronPattern: '*/30 * * * * *', comRequestId: 'request-1' })
        });

        const schema = SensorMapper.mapToSchema(model);

        expect(schema.isEnabled).toBe(true);
        expect(schema.display).toBe(true);
    });

    it('should map a child SensorModel (parentId set) to a schema input with a code/scale/unit config', () => {
        const model = Object.assign(new SensorModel(), {
            id: 'sensor-4', name: 'child sensor', description: 'd', type: SensorType.COM,
            parentId: 'sensor-parent',
            config: Object.assign(new ComSensorConfigModel(), { code: 12, scale: 0.1, unit: 'V' })
        });

        const schema = SensorMapper.mapToSchema(model);

        expect(schema.parentId).toEqual('sensor-parent');
        expect(schema.config).toEqual(expect.objectContaining({ code: 12, scale: 0.1, unit: 'V' }));
    });
});
