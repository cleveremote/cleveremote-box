import { Injectable } from '@nestjs/common';
import { ControlLoopModel } from '@process/domain/models/control-loop.model';
import { InvalidIdException } from '@process/domain/errors/db-errors';
import { isValidUuid } from '@process/domain/utils/id.util';
import { ControlLoopMongooseRepository } from './control-loop-mongoose.repository';

@Injectable()
export class ControlLoopRepository {

    public constructor(private controlLoopMongooseRepository: ControlLoopMongooseRepository) { }

    public async save(model: ControlLoopModel): Promise<ControlLoopModel> {
        if (model._id) {
            if (!isValidUuid(model._id)) {
                throw new InvalidIdException(model._id, 'control loop');
            }
            return this.controlLoopMongooseRepository.upsert(model._id, model);
        }
        return this.controlLoopMongooseRepository.create(model);
    }

    public async delete(id: string): Promise<boolean> {
        return this.controlLoopMongooseRepository.delete(id);
    }

    public async get(id?: string): Promise<ControlLoopModel | ControlLoopModel[]> {
        if (!id) {
            return this.controlLoopMongooseRepository.findAll();
        }
        return this.controlLoopMongooseRepository.findById(id);
    }

    // boucle active pilotant l'actionneur (une seule par actionneur)
    public async getEnabledForActuator(actuatorId: string): Promise<ControlLoopModel | null> {
        return this.controlLoopMongooseRepository.findEnabledByActuatorId(actuatorId);
    }

    public async migrateFromCtrlActuators(): Promise<void> {
        return this.controlLoopMongooseRepository.migrateFromCtrlActuators();
    }

}
