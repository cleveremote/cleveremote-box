import { Injectable } from '@nestjs/common';
import { ActuatorModel } from '@process/domain/models/actuator.model';
import { CycleModel } from '@process/domain/models/cycle.model';
import { CycleType } from '@process/domain/interfaces/executable.interface';
import { SynchronizeActuatorModel } from '@process/domain/models/synchronize.model';
import { InvalidIdException } from '@process/domain/errors/db-errors';
import { isValidUuid } from '@process/domain/utils/id.util';
import { ActuatorMongooseRepository } from './actuator-mongoose.repository';
import { SequenceMongooseRepository } from './sequence-mongoose.repository';
import { CycleRepository } from './cycle.repository';

@Injectable()
export class ActuatorRepository {

    public constructor(
        private actuatorMongooseRepository: ActuatorMongooseRepository,
        private sequenceMongooseRepository: SequenceMongooseRepository,
        private cycleRepository: CycleRepository
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

    // cascade : retire l'actionneur des moduleConfigs des sequences, supprime les cycles MODULE
    // devenus sans module (CycleRepository.delete emporte leurs sequences/schedules/triggers), puis le soft-supprime.
    public async delete(id: string): Promise<boolean> {
        const cycleIds = await this.sequenceMongooseRepository.findCycleIdsByModuleId(id);
        await this.sequenceMongooseRepository.removeModuleConfigsByModuleId(id);
        await this._deleteEmptyModuleCycles(cycleIds);
        return this.actuatorMongooseRepository.delete(id);
    }

    // un cycle MODULE qui reference encore un autre actionneur est conserve ; CYCLE/GROUP ne sont jamais touches
    private async _deleteEmptyModuleCycles(cycleIds: string[]): Promise<void> {
        for (const cycleId of cycleIds) {
            const cycle = await this.cycleRepository.get(cycleId) as CycleModel | null;
            if (cycle?.type === CycleType.MODULE && cycle.sequences.every((sequence) => !sequence.moduleConfigs?.length)) {
                await this.cycleRepository.delete(cycleId);
            }
        }
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
