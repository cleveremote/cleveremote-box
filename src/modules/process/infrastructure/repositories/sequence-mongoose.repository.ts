import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { Sequence, SequenceDocument } from '../schemas/sequence.schema';
import { SequenceMapper } from '../schemas/mappers/sequence.mapper';
import { NOT_DELETED_FILTER, softDeleteUpdate } from '../schemas/soft-delete.util';

@Injectable()
export class SequenceMongooseRepository {

    public constructor(
        @InjectModel(Sequence.name) private sequenceModel: Model<SequenceDocument>
    ) { }

    public async create(model: SequenceModel): Promise<SequenceModel> {
        const created = await this.sequenceModel.create(SequenceMapper.mapToSchema(model));
        return SequenceMapper.mapToModel(created);
    }

    public async upsert(id: string, model: SequenceModel): Promise<SequenceModel> {
        const saved = await this.sequenceModel.findOneAndUpdate(
            { _id: id },
            SequenceMapper.mapToSchema(model),
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        return SequenceMapper.mapToModel(saved);
    }

    public async delete(id: string): Promise<boolean> {
        const deleted = await this.sequenceModel.findByIdAndUpdate(id, softDeleteUpdate());
        if (!deleted) {
            throw new ElementNotFoundExeception(id, 'delete', 'sequence');
        }
        return true;
    }

    public async findById(id: string): Promise<SequenceModel> {
        const sequence = await this.sequenceModel.findOne({ _id: id, ...NOT_DELETED_FILTER });
        return sequence ? SequenceMapper.mapToModel(sequence) : null;
    }

    public async findAll(): Promise<SequenceModel[]> {
        const sequences = await this.sequenceModel.find(NOT_DELETED_FILTER);
        return sequences.map(SequenceMapper.mapToModel);
    }

    public async findByCycleId(cycleId: string): Promise<SequenceModel[]> {
        const sequences = await this.sequenceModel.find({ cycleId, ...NOT_DELETED_FILTER });
        return sequences.map(SequenceMapper.mapToModel);
    }

}
