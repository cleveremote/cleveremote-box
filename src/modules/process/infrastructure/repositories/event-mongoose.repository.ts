import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, PipelineStage } from 'mongoose';
import { ElementType, EventModel, ProcessEventKind } from '@process/domain/models/event.model';
import { RunIdsFilter, RunOutcome } from '@process/domain/models/cycle-history.model';
import { RUN_OUTCOME_BY_KIND } from '@process/domain/utils/cycle-history.util';
import { EventPurgeFilterModel } from '@process/domain/models/event-purge.model';
import { Event, EventDocument } from '../schemas/event.schema';
import { EventMapper } from '../schemas/mappers/event.mapper';

@Injectable()
export class EventMongooseRepository {

    public constructor(@InjectModel(Event.name) private eventModel: Model<EventDocument>) { }

    public async create(model: EventModel): Promise<EventModel> {
        const created = await this.eventModel.create(EventMapper.mapToSchema(model));
        return EventMapper.mapToModel(created);
    }

    public async findByDeviceAndDateRange(elementId: string, startDate: Date, endDate: Date): Promise<EventModel[]> {
        const events = await this.eventModel
            .find({ elementId, date: { $gte: startDate, $lte: endDate } })
            .sort({ date: 1 });
        const t =     events.map(EventMapper.mapToModel);
        return t;
    }

    public async findByRunIds(runIds: string[]): Promise<EventModel[]> {
        const events = await this.eventModel.find({ 'additionalData.runId': { $in: runIds } }).sort({ date: 1 });
        return events.map(EventMapper.mapToModel);
    }

    public async deleteMany(filter: EventPurgeFilterModel): Promise<number> {
        const query: FilterQuery<EventDocument> = {};
        if (filter.elementIds || filter.excludedElementIds?.length) {
            query.elementId = {
                ...(filter.elementIds ? { $in: filter.elementIds } : {}),
                ...(filter.excludedElementIds?.length ? { $nin: filter.excludedElementIds } : {})
            };
        }
        if (filter.keptIds?.length) {
            query._id = { $nin: filter.keptIds };
        }
        if (filter.before) {
            query.date = { $lt: filter.before };
        }
        const result = await this.eventModel.deleteMany(query);
        return result.deletedCount ?? 0;
    }

    public async findLastByDevice(elementId: string): Promise<EventModel> {
        const event = await this.eventModel.findOne({ elementId }).sort({ date: -1 });
        return event ? EventMapper.mapToModel(event) : null;
    }

    // runIds des runs ayant au moins un event correspondant au filtre, du plus recent au plus ancien ;
    // outcomes : filtre applique avant le $limit, sur l'etat calcule a partir de tous les events du run
    public async findRunIds(filter: RunIdsFilter): Promise<string[]> {
        const match: FilterQuery<EventDocument> = { 'additionalData.runId': { $exists: true, $ne: null } };
        if (filter.elementIds) {
            match.elementId = { $in: filter.elementIds };
        }
        if (filter.startDate && filter.endDate) {
            match.date = { $gte: filter.startDate, $lte: filter.endDate };
        }
        const pipeline: PipelineStage[] = [
            { $match: match },
            { $group: { _id: '$additionalData.runId', requestedAt: { $min: '$date' } } },
            ...(filter.outcomes?.length ? this._outcomeStages(filter.outcomes) : []),
            { $sort: { requestedAt: -1 } },
            ...(filter.limit ? [{ $limit: filter.limit }] : [])
        ];
        const runs = await this.eventModel.aggregate<{ _id: string }>(pipeline);
        return runs.map((run) => run._id);
    }

    // meme regle que BuildCycleRuns : dernier event du cycle (tout le run, hors periode comprise) dont le kind
    // determine un etat ; aucun => RUNNING
    private _outcomeStages(outcomes: RunOutcome[]): PipelineStage[] {
        const outcomeKinds = Object.keys(RUN_OUTCOME_BY_KIND) as ProcessEventKind[];
        const wantedKinds = outcomeKinds.filter((kind) => outcomes.includes(RUN_OUTCOME_BY_KIND[kind]));
        return [
            {
                $lookup: {
                    from: this.eventModel.collection.name,
                    let: { runId: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ['$additionalData.runId', '$$runId'] },
                                elementType: ElementType.CYCLE,
                                'additionalData.kind': { $in: outcomeKinds }
                            }
                        },
                        { $sort: { date: -1 } },
                        { $limit: 1 },
                        { $project: { _id: 0, kind: '$additionalData.kind' } }
                    ],
                    as: 'lastOutcome'
                }
            },
            {
                $match: {
                    $or: [
                        { 'lastOutcome.kind': { $in: wantedKinds } },
                        ...(outcomes.includes(RunOutcome.RUNNING) ? [{ lastOutcome: { $size: 0 } }] : [])
                    ]
                }
            }
        ];
    }

    // les `limit` derniers events de l'element, du plus ancien au plus recent
    public async findLatestByDevice(elementId: string, limit: number): Promise<EventModel[]> {
        const events = await this.eventModel.find({ elementId }).sort({ date: -1 }).limit(limit);
        return events.reverse().map(EventMapper.mapToModel);
    }

    public async findLastStatusByDevice(elementId: string): Promise<EventModel> {
        const event = await this.eventModel
            .findOne({ elementId, 'additionalData.kind': { $ne: ProcessEventKind.START_REFUSED } })
            .sort({ date: -1 });
        return event ? EventMapper.mapToModel(event) : null;
    }

}
