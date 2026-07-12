import { Injectable } from '@nestjs/common';
import { TriggerModel } from '@process/domain/models/trigger.model';
import { SynchronizeTriggerModel } from '@process/domain/models/synchronize.model';
import { InvalidIdException } from '@process/domain/errors/db-errors';
import { isValidUuid } from '@process/domain/utils/id.util';
import { TriggerMongooseRepository } from './trigger-mongoose.repository';

@Injectable()
export class TriggerRepository {

    public constructor(private triggerMongooseRepository: TriggerMongooseRepository) { }

    public async save(model: TriggerModel): Promise<TriggerModel> {
        if (model.id) {
            if (!isValidUuid(model.id)) {
                throw new InvalidIdException(model.id, 'trigger');
            }
            return this.triggerMongooseRepository.upsert(model.id, model);
        }
        return this.triggerMongooseRepository.create(model);
    }

    public async delete(id: string): Promise<boolean> {
        return this.triggerMongooseRepository.delete(id);
    }

    public async findByCycleId(cycleId: string): Promise<TriggerModel[]> {
        return this.triggerMongooseRepository.findByCycleId(cycleId);
    }

    // cascade utilisee par CycleRepository.delete() : soft-supprime tous les triggers
    // d'un cycle, independamment de tout flag `delete` (le cycle parent disparait entierement).
    public async deleteForCycle(cycleId: string): Promise<void> {
        const existing = await this.triggerMongooseRepository.findByCycleId(cycleId);
        for (const trigger of existing) {
            await this.triggerMongooseRepository.delete(trigger.id);
        }
    }

    public async get(id?: string): Promise<TriggerModel | TriggerModel[]> {
        if (!id) {
            return this.triggerMongooseRepository.findAll();
        }
        return this.triggerMongooseRepository.findById(id);
    }

    // un trigger n'est soft-supprime que s'il est explicitement marque `delete: true` dans
    // `models` ; un trigger absent de `models` reste inchange.
    public async replaceForCycle(cycleId: string, models: SynchronizeTriggerModel[]): Promise<TriggerModel[]> {
        for (const model of models) {
            if (model.delete) {
                await this.triggerMongooseRepository.delete(model.id);
                continue;
            }
            await this.save({ ...model, cycleId });
        }
        return this.triggerMongooseRepository.findByCycleId(cycleId);
    }

}
