import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { Logger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { ControlAlgorithm, ControlLoopModel } from '@process/domain/models/control-loop.model';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { ControlLoop, ControlLoopDocument } from '../schemas/control-loop.schema';
import { ControlLoopMapper } from '../schemas/mappers/control-loop.mapper';
import { NOT_DELETED_FILTER, softDeleteUpdate } from '../schemas/soft-delete.util';

const ACTUATOR_COLLECTION = 'actuators';
// anciens paramètres de régulation stockés dans actuators.config (CTRL), avant ControlLoop
const LEGACY_CTRL_REGULATION_FIELDS = ['flowMeterId', 'maxFlowRate', 'kP', 'tolerance', 'maxIterations', 'iterationDelayMs'];

@Injectable()
export class ControlLoopMongooseRepository {

    public constructor(
        @InjectModel(ControlLoop.name) private controlLoopModel: Model<ControlLoopDocument>,
        @InjectConnection() private connection: Connection,
        private readonly logger: Logger
    ) { }

    public async create(model: ControlLoopModel): Promise<ControlLoopModel> {
        const created = await this.controlLoopModel.create(ControlLoopMapper.mapToSchema(model));
        return ControlLoopMapper.mapToModel(created);
    }

    public async upsert(id: string, model: ControlLoopModel): Promise<ControlLoopModel> {
        const saved = await this.controlLoopModel.findOneAndUpdate(
            { _id: id },
            ControlLoopMapper.mapToSchema(model),
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        return ControlLoopMapper.mapToModel(saved);
    }

    public async delete(id: string): Promise<boolean> {
        const deleted = await this.controlLoopModel.findByIdAndUpdate(id, softDeleteUpdate());
        if (!deleted) {
            throw new ElementNotFoundExeception(id, 'delete', 'control loop');
        }
        return true;
    }

    public async findById(id: string): Promise<ControlLoopModel> {
        const controlLoop = await this.controlLoopModel.findOne({ _id: id, ...NOT_DELETED_FILTER });
        return controlLoop ? ControlLoopMapper.mapToModel(controlLoop) : null;
    }

    public async findAll(): Promise<ControlLoopModel[]> {
        const controlLoops = await this.controlLoopModel.find(NOT_DELETED_FILTER);
        return controlLoops.map(ControlLoopMapper.mapToModel);
    }

    public async findEnabledByActuatorId(actuatorId: string): Promise<ControlLoopModel | null> {
        const controlLoop = await this.controlLoopModel.findOne({ actuatorId, isEnabled: true, ...NOT_DELETED_FILTER });
        return controlLoop ? ControlLoopMapper.mapToModel(controlLoop) : null;
    }

    // migration one-shot, idempotente (lancée au démarrage, cf InitService) : les vannes CTRL portaient
    // leurs paramètres de régulation dans config. On en crée une ControlLoop P désactivée (aucune consigne
    // n'était persistée, à renseigner depuis le front) puis on retire ces champs de l'actionneur.
    public async migrateFromCtrlActuators(): Promise<void> {
        const actuators = this.connection.db.collection(ACTUATOR_COLLECTION);
        const legacyDocs = await actuators.find({
            type: ActuatorType.CTRL,
            $or: LEGACY_CTRL_REGULATION_FIELDS.map((field) => ({ [`config.${field}`]: { $exists: true } }))
        }).toArray();
        if (!legacyDocs.length) {
            return;
        }
        for (const doc of legacyDocs) {
            const actuatorId = String(doc._id);
            const config = (doc.config ?? {}) as Record<string, unknown>;
            if (config.flowMeterId) {
                await this.controlLoopModel.updateOne(
                    { actuatorId },
                    {
                        $setOnInsert: {
                            _id: randomUUID(),
                            name: `${doc.name ?? 'valve'} regulation`,
                            actuatorId,
                            sensorId: config.flowMeterId,
                            algorithm: ControlAlgorithm.P,
                            setpoint: 0,
                            params: {
                                kP: config.kP ?? 5,
                                kI: 0,
                                kD: 0,
                                tolerance: config.tolerance ?? 1,
                                maxIterations: config.maxIterations ?? 20,
                                iterationDelayMs: config.iterationDelayMs ?? 500
                            },
                            isEnabled: false,
                            deletedAt: null
                        }
                    },
                    { upsert: true }
                );
            }
            await actuators.updateOne(
                { _id: doc._id },
                { $unset: Object.fromEntries(LEGACY_CTRL_REGULATION_FIELDS.map((field) => [`config.${field}`, ''])) }
            );
        }
        this.logger.log({ count: legacyDocs.length }, 'migrated CTRL actuators regulation params into control_loops');
    }

}
