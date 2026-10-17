import { Injectable } from '@nestjs/common';
import { ActuatorModel } from '@process/domain/models/actuator.model';
import { SynchronizeActuatorModel } from '@process/domain/models/synchronize.model';
import { InvalidIdException } from '@process/domain/errors/db-errors';
import { isValidUuid } from '@process/domain/utils/id.util';
import { ActuatorMongooseRepository } from './actuator-mongoose.repository';
import { SequenceMongooseRepository } from './sequence-mongoose.repository';

@Injectable()
export class ActuatorRepository {

    public constructor(
        private actuatorMongooseRepository: ActuatorMongooseRepository,
        private sequenceMongooseRepository: SequenceMongooseRepository
    ) { }

    public async save(model: ActuatorModel): Promise<ActuatorModel> {
        if (model._id) {
            if (!isValidUuid(model._id)) {
                throw new InvalidIdException(model._id, 'actuator');
            }
            return this.actuatorMongooseRepository.upsert(model._id, model);
        }
        return this.actuatorMongooseRepository.create(model);
    }

    // cascade : retire l'actionneur des moduleConfigs des sequences avant de le soft-supprimer.
    public async delete(id: string): Promise<boolean> {
        await this.sequenceMongooseRepository.removeModuleConfigsByModuleId(id);
        return this.actuatorMongooseRepository.delete(id);
    }

    // cascade utilisee par DeviceRepository.delete() : soft-supprime tous les actionneurs
    // rattaches au device (config.deviceId), independamment de tout flag `delete`.
    public async deleteForDevice(deviceId: string): Promise<void> {
        const existing = await this.actuatorMongooseRepository.findByDeviceId(deviceId);
        for (const actuator of existing) {
            await this.delete(actuator._id);
        }
    }

    public async findByIds(ids: string[]): Promise<ActuatorModel[]> {
        return this.actuatorMongooseRepository.findByIds(ids);
    }

    public async get(id?: string): Promise<ActuatorModel | ActuatorModel[]> {
        if (!id) {
            return this.actuatorMongooseRepository.findAll();
        }
        return this.actuatorMongooseRepository.findById(id);
    }

    // les actionneurs sont partageables entre sequences : retirer une reference cote
    // SequenceModel.moduleConfigs ne supprime pas l'actionneur, cf. SequenceRepository.
    // un actionneur n'est soft-supprime que s'il est explicitement marque `delete: true`.
    public async saveMany(models: SynchronizeActuatorModel[]): Promise<ActuatorModel[]> {
        for (const model of models) {
            if (model.delete) {
                await this.delete(model._id);
                continue;
            }
            await this.save(model);
        }
        return this.actuatorMongooseRepository.findAll();
    }

}
