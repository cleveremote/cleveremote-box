import { Injectable } from '@nestjs/common';
import { ScheduleModel } from '@process/domain/models/schedule.model';
import { SynchronizeScheduleModel } from '@process/domain/models/synchronize.model';
import { InvalidIdException } from '@process/domain/errors/db-errors';
import { isValidUuid } from '@process/domain/utils/id.util';
import { ScheduleMongooseRepository } from './schedule-mongoose.repository';

@Injectable()
export class ScheduleRepository {

    public constructor(private scheduleMongooseRepository: ScheduleMongooseRepository) { }

    public async save(model: ScheduleModel): Promise<ScheduleModel> {
        if (model._id) {
            if (!isValidUuid(model._id)) {
                throw new InvalidIdException(model._id, 'schedule');
            }
            return this.scheduleMongooseRepository.upsert(model._id, model);
        }
        return this.scheduleMongooseRepository.create(model);
    }

    public async delete(id: string): Promise<boolean> {
        return this.scheduleMongooseRepository.delete(id);
    }

    public async findByCycleId(cycleId: string): Promise<ScheduleModel[]> {
        return this.scheduleMongooseRepository.findByCycleId(cycleId);
    }

    // cascade utilisee par CycleRepository.delete() : soft-supprime tous les schedules
    // d'un cycle, independamment de tout flag `delete` (le cycle parent disparait entierement).
    public async deleteForCycle(cycleId: string): Promise<void> {
        const existing = await this.scheduleMongooseRepository.findByCycleId(cycleId);
        for (const schedule of existing) {
            await this.scheduleMongooseRepository.delete(schedule._id);
        }
    }

    public async get(id?: string): Promise<ScheduleModel | ScheduleModel[]> {
        if (!id) {
            return this.scheduleMongooseRepository.findAll();
        }
        return this.scheduleMongooseRepository.findById(id);
    }

    // un schedule n'est soft-supprime que s'il est explicitement marque `delete: true` dans
    // `models` ; un schedule absent de `models` reste inchange.
    public async replaceForCycle(cycleId: string, models: SynchronizeScheduleModel[]): Promise<ScheduleModel[]> {
        for (const model of models) {
            if (model.delete) {
                await this.scheduleMongooseRepository.delete(model._id);
                continue;
            }
            await this.save({ ...model, cycleId });
        }
        return this.scheduleMongooseRepository.findByCycleId(cycleId);
    }

}
