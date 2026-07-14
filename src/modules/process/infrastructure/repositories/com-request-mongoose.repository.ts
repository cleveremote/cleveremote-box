import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Logger } from 'nestjs-pino';
import { ComRequestModel, ModbusFunctionName } from '@process/domain/models/com-request.model';
import { ComRequestType } from '@process/domain/interfaces/com-request.interface';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { ComRequest, ComRequestDocument } from '../schemas/comrequest.schema';
import { ModbusTaskMapper } from '../schemas/mappers/modbus-task.mapper';
import { NOT_DELETED_FILTER, softDeleteUpdate } from '../schemas/soft-delete.util';

// sortie des coils (ecriture) et lecture des coils (relit l'etat d'une sortie) -> DIGITAL_OUTPUT ;
// discrete inputs (lecture seule) -> DIGITAL_INPUT ; holding registers (ecriture/config) ->
// ANALOG_OUTPUT ; input registers (lecture seule) -> ANALOG_INPUT. Coherent avec l'unique document
// reel observe (function: 'writeCoil', label: 'DO1' -> DIGITAL_OUTPUT).
const FUNCTION_TO_TYPE: Partial<Record<ModbusFunctionName, ComRequestType[]>> = {
    [ModbusFunctionName.READ_COILS]: [ComRequestType.DIGITAL_OUTPUT],
    [ModbusFunctionName.WRITE_SINGLE_COIL]: [ComRequestType.DIGITAL_OUTPUT],
    [ModbusFunctionName.WRITE_MULTIPLE_COILS]: [ComRequestType.DIGITAL_OUTPUT],
    [ModbusFunctionName.READ_DISCRETE_INPUTS]: [ComRequestType.DIGITAL_INPUT],
    [ModbusFunctionName.READ_HOLDING_REGISTERS]: [ComRequestType.ANALOG_OUTPUT],
    [ModbusFunctionName.WRITE_SINGLE_REGISTER]: [ComRequestType.ANALOG_OUTPUT],
    [ModbusFunctionName.WRITE_MULTIPLE_REGISTERS]: [ComRequestType.ANALOG_OUTPUT],
    [ModbusFunctionName.READ_INPUT_REGISTERS]: [ComRequestType.ANALOG_INPUT]
};

@Injectable()
export class ComRequestkMongooseRepository {

    public constructor(
        @InjectModel(ComRequest.name) private taskModel: Model<ComRequestDocument>,
        private readonly logger: Logger
    ) { }

    public async create(model: ComRequestModel): Promise<ComRequestModel> {
        const created = await this.taskModel.create(ModbusTaskMapper.mapToSchema(model));
        return ModbusTaskMapper.mapToModel(created);
    }

    public async update(id: string, model: ComRequestModel): Promise<ComRequestModel> {
        const updated = await this.taskModel.findByIdAndUpdate(id, ModbusTaskMapper.mapToSchema(model), { new: true });
        if (!updated) {
            throw new ElementNotFoundExeception(id, 'update', 'modbusTask');
        }
        return ModbusTaskMapper.mapToModel(updated);
    }

    public async upsert(id: string, model: ComRequestModel): Promise<ComRequestModel> {
        const saved = await this.taskModel.findOneAndUpdate(
            { _id: id },
            ModbusTaskMapper.mapToSchema(model),
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        return ModbusTaskMapper.mapToModel(saved);
    }

    public async delete(id: string): Promise<boolean> {
        const deleted = await this.taskModel.findByIdAndUpdate(id, softDeleteUpdate());
        if (!deleted) {
            throw new ElementNotFoundExeception(id, 'delete', 'modbusTask');
        }
        return true;
    }

    public async findById(id: string): Promise<ComRequestModel> {
        const task = await this.taskModel.findOne({ _id: id, ...NOT_DELETED_FILTER });
        return task ? ModbusTaskMapper.mapToModel(task) : null;
    }

    public async findAll(): Promise<ComRequestModel[]> {
        const tasks = await this.taskModel.find(NOT_DELETED_FILTER);
        return tasks.map(ModbusTaskMapper.mapToModel);
    }

    public async findByDeviceIdAndTypes(deviceId: string, types: ComRequestType[]): Promise<ComRequestModel[]> {
        if (!types?.length) {
            return [];
        }
        const tasks = await this.taskModel.find({ deviceId, type: { $in: types }, ...NOT_DELETED_FILTER });
        return tasks.map(ModbusTaskMapper.mapToModel);
    }

    // migration one-shot, idempotente et non destructive : `type` a ete ajoute comme champ requis
    // apres coup (cf ComRequestModel), donc les comrequests deja persistes sur les box deployees
    // ne l'ont pas. On ne peut pas se connecter a chaque box pour lancer un script manuel, donc la
    // migration tourne au demarrage de l'app (cf InitService), meme strategie que
    // ActuatorMongooseRepository.migrateLegacyCollections. Deduit de `function` (cf FUNCTION_TO_TYPE) ;
    // une fonction inconnue de la table est skip (log un warn) plutot que devinee.
    public async migrateMissingType(): Promise<void> {
        const untyped = await this.taskModel.collection.find({ type: { $exists: false } }).toArray();
        if (!untyped.length) {
            return;
        }
        let migratedCount = 0;
        for (const doc of untyped) {
            const functions: ModbusFunctionName[] = Array.isArray(doc.function) ? doc.function : [doc.function];
            const type = new Set<ComRequestType>();
            functions.forEach(fn => (FUNCTION_TO_TYPE[fn] ?? []).forEach(t => type.add(t)));
            if (!type.size) {
                this.logger.warn({ id: doc._id, function: doc.function }, 'comrequest.type could not be inferred from an unknown function, left untouched');
                continue;
            }
            await this.taskModel.collection.updateOne({ _id: doc._id }, { $set: { type: [...type] } });
            migratedCount++;
        }
        this.logger.log({ migratedCount }, 'backfilled missing comrequests.type from function');
    }

}
