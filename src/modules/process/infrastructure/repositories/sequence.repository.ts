import { Injectable } from '@nestjs/common';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { SynchronizeSequenceModel } from '@process/domain/models/synchronize.model';
import { InvalidIdException } from '@process/domain/errors/db-errors';
import { isValidUuid } from '@process/domain/utils/id.util';
import { SequenceMongooseRepository } from './sequence-mongoose.repository';

@Injectable()
export class SequenceRepository {

    public constructor(
        private sequenceMongooseRepository: SequenceMongooseRepository
    ) { }

    public async save(model: SequenceModel): Promise<SequenceModel> {
        if (model._id) {
            if (!isValidUuid(model._id)) {
                throw new InvalidIdException(model._id, 'sequence');
            }
            return this.sequenceMongooseRepository.upsert(model._id, model);
        }
        return this.sequenceMongooseRepository.create(model);
    }

    // les modules sont partageables entre sequences : supprimer une sequence ne supprime
    // pas les modules qu'elle referencait, ils peuvent encore etre utilises ailleurs.
    public async delete(id: string): Promise<boolean> {
        return this.sequenceMongooseRepository.delete(id);
    }

    public async get(id?: string): Promise<SequenceModel | SequenceModel[]> {
        if (!id) {
            return this.sequenceMongooseRepository.findAll();
        }
        return this.sequenceMongooseRepository.findById(id);
    }

    public async findByCycleId(cycleId: string): Promise<SequenceModel[]> {
        return this.sequenceMongooseRepository.findByCycleId(cycleId);
    }

    // cascade utilisee par CycleRepository.delete() : soft-supprime toutes les sequences
    // d'un cycle, independamment de tout flag `delete` (le cycle parent disparait entierement).
    public async deleteForCycle(cycleId: string): Promise<void> {
        const existing = await this.sequenceMongooseRepository.findByCycleId(cycleId);
        for (const sequence of existing) {
            await this.delete(sequence._id);
        }
    }

    // une sequence n'est soft-supprimee que si elle est explicitement marquee `delete: true`
    // dans `models` (ses modules restent en base, potentiellement encore references par
    // d'autres sequences) ; une sequence absente de `models` reste inchangee.
    // les modules (actuator-rpi/actuator-com) ne sont plus crees ici : ils existent deja
    // (crees via leurs endpoints de sync dedies) et ne sont que reference par id dans
    // model.moduleConfigs.
    public async replaceForCycle(cycleId: string, models: SynchronizeSequenceModel[]): Promise<SequenceModel[]> {
        for (const model of models) {
            if (model.delete) {
                await this.delete(model._id);
                continue;
            }
            model.cycleId = cycleId;
            await this.save(model);
        }
        return this.sequenceMongooseRepository.findByCycleId(cycleId);
    }

}
