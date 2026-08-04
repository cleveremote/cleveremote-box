import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { CycleMongooseRepository } from '@process/infrastructure/repositories/cycle-mongoose.repository';
import { ChildCycleMapper } from '@process/infrastructure/schemas/mappers/child-cycle.mapper';
import { ElementNotFoundExeception } from '../errors/db-errors';
import { ChildCycleRef, CycleModel } from '../models/cycle.model';

@Injectable()
export class CycleGroupService {

    public constructor(
        private cycleRepository: CycleMongooseRepository,
        private readonly logger: Logger
    ) { }

    public async create(model: CycleModel): Promise<CycleModel> {
        this.logger.log({ name: model.name }, 'creating cycle');
        return this.cycleRepository.create(model);
    }

    public async update(id: string, model: CycleModel): Promise<CycleModel> {
        this.logger.log({ cycleId: id }, 'updating cycle');
        return this.cycleRepository.update(id, model);
    }

    public async get(id: string): Promise<CycleModel> {
        const cycle = await this.cycleRepository.findById(id);
        if (!cycle) {
            throw new ElementNotFoundExeception(id, 'get', 'cycle');
        }
        return cycle;
    }

    public async getAll(): Promise<CycleModel[]> {
        return this.cycleRepository.findAll();
    }

    public async getRoots(): Promise<CycleModel[]> {
        return this.cycleRepository.findRoots();
    }

    public async delete(id: string): Promise<boolean> {
        const cycle = await this.get(id);
        if (cycle.childCycles?.length > 0) {
            throw new Error(`cannot delete cycle ${id}: it still has ${cycle.childCycles.length} child cycle(s), move or remove them first`);
        }
        if (cycle.parentCycleId) {
            await this.removeChild(cycle.parentCycleId, id);
        }
        this.logger.log({ cycleId: id }, 'deleting cycle');
        return this.cycleRepository.delete(id);
    }

    public async addChild(parentId: string, childRef: ChildCycleRef): Promise<CycleModel> {
        const parent = await this.get(parentId);
        const child = await this.get(childRef.cycleId);
        if (child.parentCycleId) {
            throw new Error(`cycle ${child._id} already belongs to parent ${child.parentCycleId}`);
        }
        const order = childRef.config?.order ?? parent.childCycles?.length ?? 0;
        child.parentCycleId = parentId;
        await this.update(child._id, child);
        return this.cycleRepository.addChild(parentId, ChildCycleMapper.mapToSchema({ ...childRef, config: { ...childRef.config, order } }));
    }

    public async removeChild(parentId: string, childCycleId: string): Promise<CycleModel> {
        const child = await this.get(childCycleId);
        child.parentCycleId = null;
        await this.update(child._id, child);
        return this.cycleRepository.removeChild(parentId, childCycleId);
    }

    public async reorderChildren(parentId: string, orderedChildCycleIds: string[]): Promise<CycleModel> {
        const parent = await this.get(parentId);
        parent.childCycles = orderedChildCycleIds.map((cycleId, order) => {
            const existing = parent.childCycles.find((childCycle) => childCycle.cycleId === cycleId);
            if (!existing) {
                throw new ElementNotFoundExeception(cycleId, 'reorder', 'childCycle');
            }
            return { ...existing, config: { ...existing.config, order } };
        });
        return this.cycleRepository.update(parentId, parent);
    }

}
