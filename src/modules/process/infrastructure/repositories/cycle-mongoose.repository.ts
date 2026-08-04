import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CycleModel } from '@process/domain/models/cycle.model';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { Cycle, CycleDocument } from '../schemas/cycle.schema';
import { ChildCycle } from '../schemas/child-cycle.schema';
import { CycleMapper } from '../schemas/mappers/cycle.mapper';
import { NOT_DELETED_FILTER, softDeleteUpdate } from '../schemas/soft-delete.util';
import { SequenceMongooseRepository } from './sequence-mongoose.repository';
import { ScheduleMongooseRepository } from './schedule-mongoose.repository';
import { TriggerMongooseRepository } from './trigger-mongoose.repository';

@Injectable()
export class CycleMongooseRepository {

    public constructor(
        @InjectModel(Cycle.name) private cycleModel: Model<CycleDocument>,
        private sequenceMongooseRepository: SequenceMongooseRepository,
        private scheduleMongooseRepository: ScheduleMongooseRepository,
        private triggerMongooseRepository: TriggerMongooseRepository
    ) { }

    public async create(model: CycleModel): Promise<CycleModel> {
        const created = await this.cycleModel.create(CycleMapper.mapToSchema(model));
        return this._hydrate(CycleMapper.mapToModel(created));
    }

    public async update(id: string, model: CycleModel): Promise<CycleModel> {
        const updated = await this.cycleModel.findByIdAndUpdate(id, CycleMapper.mapToSchema(model), { new: true });
        if (!updated) {
            throw new ElementNotFoundExeception(id, 'update', 'cycle');
        }
        return this._hydrate(CycleMapper.mapToModel(updated));
    }

    public async upsert(id: string, model: CycleModel): Promise<CycleModel> {
        const saved = await this.cycleModel.findOneAndUpdate(
            { _id: id },
            CycleMapper.mapToSchema(model),
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        return this._hydrate(CycleMapper.mapToModel(saved));
    }

    public async delete(id: string): Promise<boolean> {
        const deleted = await this.cycleModel.findByIdAndUpdate(id, softDeleteUpdate());
        if (!deleted) {
            throw new ElementNotFoundExeception(id, 'delete', 'cycle');
        }
        return true;
    }

    public async findById(id: string): Promise<CycleModel> {
        const cycle = await this.cycleModel.findOne({ _id: id, ...NOT_DELETED_FILTER });
        return cycle ? this._hydrate(CycleMapper.mapToModel(cycle)) : null;
    }

    public async findAll(): Promise<CycleModel[]> {
        const cycles = await this.cycleModel.find(NOT_DELETED_FILTER);
        return Promise.all(cycles.map((cycle) => this._hydrate(CycleMapper.mapToModel(cycle))));
    }

    public async findRoots(): Promise<CycleModel[]> {
        const cycles = await this.cycleModel.find({ parentCycleId: null, ...NOT_DELETED_FILTER });
        return Promise.all(cycles.map((cycle) => this._hydrate(CycleMapper.mapToModel(cycle))));
    }

    public async addChild(parentId: string, child: ChildCycle): Promise<CycleModel> {
        const updated = await this.cycleModel.findByIdAndUpdate(
            parentId,
            { $push: { childCycles: child } },
            { new: true }
        );
        if (!updated) {
            throw new ElementNotFoundExeception(parentId, 'update', 'cycle');
        }
        return this._hydrate(CycleMapper.mapToModel(updated));
    }

    public async removeChild(parentId: string, childCycleId: string): Promise<CycleModel> {
        const updated = await this.cycleModel.findByIdAndUpdate(
            parentId,
            { $pull: { childCycles: { cycleId: childCycleId } } },
            { new: true }
        );
        if (!updated) {
            throw new ElementNotFoundExeception(parentId, 'update', 'cycle');
        }
        return this._hydrate(CycleMapper.mapToModel(updated));
    }

    // sequences/schedules/triggers vivent desormais dans leurs propres collections
    // (cycleId comme cle etrangere) ; on les rattache ici en memoire pour les consommateurs
    // (ExecutionService, StructureService) qui attendent un CycleModel "plein".
    private async _hydrate(model: CycleModel): Promise<CycleModel> {
        model.sequences = await this.sequenceMongooseRepository.findByCycleId(model._id);
        model.schedules = await this.scheduleMongooseRepository.findByCycleId(model._id);
        model.triggers = await this.triggerMongooseRepository.findByCycleId(model._id);
        return model;
    }

}
