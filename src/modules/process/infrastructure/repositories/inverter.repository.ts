import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { InverterModel } from '@process/domain/models/inverter.model';
import { InvalidIdException } from '@process/domain/errors/db-errors';
import { isValidUuid } from '@process/domain/utils/id.util';
import { InverterMongooseRepository } from './inverter-mongoose.repository';

// élément variateur enregistré (saved) ou soft-supprimé (deleted), émis après l'écriture en base
export type InverterChange = { type: 'saved'; inverter: InverterModel } | { type: 'deleted'; id: string };

@Injectable()
export class InverterRepository {
    private readonly _changes = new Subject<InverterChange>();
    public readonly changes$: Observable<InverterChange> = this._changes.asObservable();

    public constructor(private inverterMongooseRepository: InverterMongooseRepository) { }

    public async save(model: InverterModel): Promise<InverterModel> {
        if (model._id && !isValidUuid(model._id)) {
            throw new InvalidIdException(model._id, 'inverter');
        }
        const saved = model._id
            ? await this.inverterMongooseRepository.upsert(model._id, model)
            : await this.inverterMongooseRepository.create(model);
        this._changes.next({ type: 'saved', inverter: saved });
        return saved;
    }

    public async delete(id: string): Promise<boolean> {
        const isDeleted = await this.inverterMongooseRepository.delete(id);
        this._changes.next({ type: 'deleted', id });
        return isDeleted;
    }

    public async get(id?: string): Promise<InverterModel | InverterModel[]> {
        if (!id) {
            return this.inverterMongooseRepository.findAll();
        }
        return this.inverterMongooseRepository.findById(id);
    }

    // éléments variateur rattachés à un slave
    public async getByDeviceId(deviceId: string): Promise<InverterModel[]> {
        return this.inverterMongooseRepository.findByDeviceId(deviceId);
    }

    // cascade de la suppression d'un slave
    public async deleteForDevice(deviceId: string): Promise<void> {
        for (const inverter of await this.inverterMongooseRepository.findByDeviceId(deviceId)) {
            await this.delete(inverter._id);
        }
    }

}
