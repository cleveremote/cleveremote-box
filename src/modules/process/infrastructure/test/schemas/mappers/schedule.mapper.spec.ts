import { ScheduleMapper } from '@process/infrastructure/schemas/mappers/schedule.mapper';
import { ScheduleModel } from '@process/domain/models/schedule.model';
import { ScheduleDocument } from '@process/infrastructure/schemas/schedule.schema';

describe('ScheduleMapper', () => {
    it('should map a document to a model with every field copied, keeping cron.date a Date instance', () => {
        const document = {
            _id: 'schedule-1', cycleId: 'cycle-1', name: 'schedule', description: 'd',
            cron: { date: new Date('2026-01-01T00:00:00.000Z') }, isPaused: false, shouldConfirmation: true
        } as unknown as ScheduleDocument;

        const model = ScheduleMapper.mapToModel(document);

        expect(model.cron.date).toBeInstanceOf(Date);
        expect(model.cron.date.toISOString()).toEqual('2026-01-01T00:00:00.000Z');
        expect(model).toEqual(expect.objectContaining({ _id: 'schedule-1', cycleId: 'cycle-1', shouldConfirmation: true }));
    });

    it('should leave cron.date untouched when absent', () => {
        const document = {
            _id: 'schedule-1', cycleId: 'cycle-1', name: 'schedule', description: 'd', cron: { pattern: '* * * * *' }, isPaused: false, shouldConfirmation: false
        } as unknown as ScheduleDocument;

        const model = ScheduleMapper.mapToModel(document);

        expect(model.cron.date).toBeUndefined();
        expect(model.cron.pattern).toEqual('* * * * *');
    });

    it('should map a model to a schema input with every field copied', () => {
        const model = Object.assign(new ScheduleModel(), {
            _id: 'schedule-1', cycleId: 'cycle-1', name: 'schedule', description: 'd', cron: { pattern: '0 0 * * *' }, isPaused: true, shouldConfirmation: false
        });

        const schema = ScheduleMapper.mapToSchema(model);

        expect(schema).toEqual(expect.objectContaining({ cycleId: 'cycle-1', isPaused: true }));
        expect(schema.cron).toEqual({ pattern: '0 0 * * *' });
    });
});
