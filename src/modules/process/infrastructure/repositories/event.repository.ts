import { Injectable } from '@nestjs/common';
import { EventModel } from '@process/domain/models/event.model';
import { EventPurgeFilterModel } from '@process/domain/models/event-purge.model';
import { EventMongooseRepository } from './event-mongoose.repository';

@Injectable()
export class EventRepository {

    public constructor(private eventMongooseRepository: EventMongooseRepository) { }

    public async save(model: EventModel): Promise<EventModel> {
        return this.eventMongooseRepository.create(model);
    }

    public async getByDeviceAndDateRange(elementId: string, startDate: Date, endDate: Date): Promise<EventModel[]> {
        return this.eventMongooseRepository.findByDeviceAndDateRange(elementId, startDate, endDate);
    }

    public async getByDevicesAndDateRange(elementIds: string[], startDate: Date, endDate: Date): Promise<EventModel[]> {
        return this.eventMongooseRepository.findByDevicesAndDateRange(elementIds, startDate, endDate);
    }

    // tous les events de ces runs, meme hors de la periode demandee (run a cheval sur une borne)
    public async getByRunIds(runIds: string[]): Promise<EventModel[]> {
        return runIds.length ? this.eventMongooseRepository.findByRunIds(runIds) : [];
    }

    // nombre d'events supprimes
    public async purge(filter: EventPurgeFilterModel): Promise<number> {
        return this.eventMongooseRepository.deleteMany(filter);
    }

    public async getLast(elementId: string): Promise<EventModel> {
        return this.eventMongooseRepository.findLastByDevice(elementId);
    }

    // dernier event portant un statut (ignore les traces START_REFUSED) : rehydratation au boot
    public async getLastStatus(elementId: string): Promise<EventModel> {
        return this.eventMongooseRepository.findLastStatusByDevice(elementId);
    }

}
