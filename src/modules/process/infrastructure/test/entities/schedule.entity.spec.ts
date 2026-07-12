import { ScheduleEntity } from '@process/infrastructure/entities/schedule.entity';
import { ScheduleModel } from '@process/domain/models/schedule.model';

describe('ScheduleEntity', () => {
    it('should map an entity to a model and re-hydrate the cron.date as a real Date instance', () => {
        const entity = Object.assign(new ScheduleEntity(), {
            _id: 'schedule-1', cycleId: 'cycle-1', name: 'schedule', description: 'd',
            cron: { date: '2026-01-01T00:00:00.000Z' as unknown as Date }, isPaused: false, shouldConfirmation: true
        });

        const model = ScheduleEntity.mapToModel(entity);

        expect(model.cron.date).toBeInstanceOf(Date);
        expect(model.cron.date.toISOString()).toEqual('2026-01-01T00:00:00.000Z');
        expect(model).toEqual(expect.objectContaining({ _id: 'schedule-1', cycleId: 'cycle-1', shouldConfirmation: true }));
    });

    it('should leave cron.date untouched when absent', () => {
        const entity = Object.assign(new ScheduleEntity(), {
            _id: 'schedule-1', cycleId: 'cycle-1', name: 'schedule', description: 'd', cron: { pattern: '* * * * *' }, isPaused: false, shouldConfirmation: false
        });

        const model = ScheduleEntity.mapToModel(entity);

        expect(model.cron.date).toBeUndefined();
        expect(model.cron.pattern).toEqual('* * * * *');
    });

    it('should map a model to an entity with every field copied', () => {
        const model = Object.assign(new ScheduleModel(), {
            _id: 'schedule-1', cycleId: 'cycle-1', name: 'schedule', description: 'd', cron: { pattern: '0 0 * * *' }, isPaused: true, shouldConfirmation: false
        });

        const entity = ScheduleEntity.mapToEntity(model);

        expect(entity).toEqual(expect.objectContaining({ _id: 'schedule-1', cycleId: 'cycle-1', isPaused: true }));
        expect(entity.cron).toEqual({ pattern: '0 0 * * *' });
    });
});
