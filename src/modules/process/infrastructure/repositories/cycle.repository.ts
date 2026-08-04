import { Injectable } from '@nestjs/common';
import { CycleModel } from '@process/domain/models/cycle.model';
import { SynchronizeCycleModel } from '@process/domain/models/synchronize.model';
import { ElementNotFoundExeception, InvalidIdException } from '@process/domain/errors/db-errors';
import { isValidUuid } from '@process/domain/utils/id.util';
import { ChildCycleMapper } from '../schemas/mappers/child-cycle.mapper';
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
        if (model._id && !isValidUuid(model._id)) {
            throw new InvalidIdException(model._id, 'cycle');
        }
        const previous = model._id ? await this.cycleMongooseRepository.findById(model._id) : null;
        const saved = model._id
            ? await this.cycleMongooseRepository.upsert(model._id, model)
            : await this.cycleMongooseRepository.create(model);
        await this._reconcileParent(previous?.parentCycleId ?? null, saved);
        return saved;
    }

    public async delete(id: string): Promise<boolean> {
        const cycle = await this.cycleMongooseRepository.findById(id);
        await this.sequenceRepository.deleteForCycle(id);
        await this.scheduleRepository.deleteForCycle(id);
        await this.triggerRepository.deleteForCycle(id);
        const deleted = await this.cycleMongooseRepository.delete(id);
        if (cycle?.parentCycleId) {
            await this._removeChildSafe(cycle.parentCycleId, id);
        }
        return deleted;
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

    // box/synchronize/cycle ne transmet qu'un seul cycle a la fois : l'appelant ne peut pas
    // decrire l'etat complet du parent dans le meme appel. On repercute donc nous-memes le lien
    // parentCycleId <-> childCycles sur le document parent plutot que d'attendre un second appel.
    private async _reconcileParent(previousParentId: string | null, cycle: CycleModel): Promise<void> {
        const newParentId = cycle.parentCycleId ?? null;
        if (previousParentId === newParentId) {
            if (newParentId) {
                await this._ensureChildRef(newParentId, cycle);
            }
            return;
        }
        if (previousParentId) {
            await this._removeChildSafe(previousParentId, cycle._id);
        }
        if (newParentId) {
            await this._ensureChildRef(newParentId, cycle);
        }
    }

    private async _ensureChildRef(parentId: string, cycle: CycleModel): Promise<void> {
        const parent = await this.cycleMongooseRepository.findById(parentId);
        if (!parent || parent.childCycles?.some((ref) => ref.cycleId === cycle._id)) {
            return;
        }
        const order = parent.childCycles?.length ?? 0;
        await this.cycleMongooseRepository.addChild(parentId, ChildCycleMapper.mapToSchema({
            cycleId: cycle._id,
            config: { order, waitForCompletion: true, delayBefore: 0, delayAfter: 0, isSkipped: false }
        }));
    }

    // nettoyage best-effort : un parent deja supprime/introuvable ne doit pas faire echouer
    // la sauvegarde/suppression de l'enfant qui a declenche cet appel.
    private async _removeChildSafe(parentId: string, childCycleId: string): Promise<void> {
        try {
            await this.cycleMongooseRepository.removeChild(parentId, childCycleId);
        } catch (error) {
            if (!(error instanceof ElementNotFoundExeception)) {
                throw error;
            }
        }
    }

}
