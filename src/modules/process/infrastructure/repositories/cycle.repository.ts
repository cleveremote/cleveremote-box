import { Injectable } from '@nestjs/common';
import { CycleModel } from '@process/domain/models/cycle.model';
import { SynchronizeCycleModel } from '@process/domain/models/synchronize.model';
import { InvalidIdException } from '@process/domain/errors/db-errors';
import { isValidUuid } from '@process/domain/utils/id.util';
import { CycleMongooseRepository } from './cycle-mongoose.repository';
import { SequenceRepository } from './sequence.repository';
import { ScheduleRepository } from './schedule.repository';
import { TriggerRepository } from './trigger.repository';

@Injectable()
export class CycleRepository {

    public constructor(
        private cycleMongooseRepository: CycleMongooseRepository,
        private sequenceRepository: SequenceRepository,
        private scheduleRepository: ScheduleRepository,
        private triggerRepository: TriggerRepository
    ) { }

    public async save(model: CycleModel): Promise<CycleModel> {
        if (model._id) {
            if (!isValidUuid(model._id)) {
                throw new InvalidIdException(model._id, 'cycle');
            }
            return this.cycleMongooseRepository.upsert(model._id, model);
        }
        return this.cycleMongooseRepository.create(model);
    }

    public async delete(id: string): Promise<boolean> {
        await this.sequenceRepository.deleteForCycle(id);
        await this.scheduleRepository.deleteForCycle(id);
        await this.triggerRepository.deleteForCycle(id);
        return this.cycleMongooseRepository.delete(id);
    }

    public async get(id?: string): Promise<CycleModel | CycleModel[]> {
        if (!id) {
            return this.cycleMongooseRepository.findAll();
        }
        return this.cycleMongooseRepository.findById(id);
    }

    // la suppression n'est plus deduite de l'absence d'un cycle dans `models` : seul un cycle
    // explicitement marque `delete: true` est soft-supprime (avec ses sequences/schedules/triggers,
    // cf. this.delete()). Un cycle absent de `models` reste inchange.
    public async replaceAll(models: SynchronizeCycleModel[]): Promise<CycleModel[]> {
        for (const model of models) {
            if (model.delete) {
                await this.delete(model._id);
                continue;
            }
            const cycle = await this.save(model);
            cycle.sequences = await this.sequenceRepository.replaceForCycle(cycle._id, model.sequences ?? []);
            cycle.schedules = await this.scheduleRepository.replaceForCycle(cycle._id, model.schedules ?? []);
            cycle.triggers = await this.triggerRepository.replaceForCycle(cycle._id, model.triggers ?? []);
        }
        return this.cycleMongooseRepository.findAll();
    }

}
