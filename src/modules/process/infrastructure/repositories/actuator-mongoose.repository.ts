import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { Logger } from 'nestjs-pino';
import { ActuatorModel } from '@process/domain/models/actuator.model';
import { ActuatorType } from '@process/domain/interfaces/actuator-module.interface';
import { ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { Actuator, ActuatorDocument, ActuatorRpi, ActuatorCom, ActuatorCtrl } from '../schemas/actuator.schema';
import { ActuatorMapper } from '../schemas/mappers/actuator.mapper';
import { NOT_DELETED_FILTER, softDeleteUpdate } from '../schemas/soft-delete.util';

const LEGACY_ACTUATOR_RPI_COLLECTION = 'relay_rpis';
const LEGACY_ACTUATOR_COM_COLLECTION = 'relay_coms';
// vannes anciennement persistees dans leur propre collection/modele Mongo (Valve), avant la
// fusion du domaine Valve dans Actuator (type discriminant CTRL) : meme strategie de migration
// non destructive que relay_rpis/relay_coms ci-dessus.
const LEGACY_VALVE_COLLECTION = 'valves';

@Injectable()
export class ActuatorMongooseRepository {

    public constructor(
        @InjectModel(Actuator.name) private actuatorModel: Model<ActuatorDocument>,
        @InjectModel(ActuatorRpi.name) private actuatorRpiModel: Model<ActuatorDocument>,
        @InjectModel(ActuatorCom.name) private actuatorComModel: Model<ActuatorDocument>,
        @InjectModel(ActuatorCtrl.name) private actuatorCtrlModel: Model<ActuatorDocument>,
        @InjectConnection() private connection: Connection,
        private readonly logger: Logger
    ) { }

    // le modele discriminant (ActuatorRpi/ActuatorCom/ActuatorCtrl) applique le sous-schema de
    // config propre au type et force le champ discriminant `type` a la bonne valeur : la
    // valorisation du config par type d'actuator est ainsi garantie au niveau base de donnees,
    // pas seulement dans le mapper (cf actuator.schema.ts).
    private _resolveDiscriminatorModel(type: ActuatorType): Model<ActuatorDocument> {
        if (type === ActuatorType.RPI) {
            return this.actuatorRpiModel;
        }
        if (type === ActuatorType.COM) {
            return this.actuatorComModel;
        }
        return this.actuatorCtrlModel;
    }

    public async create(model: ActuatorModel): Promise<ActuatorModel> {
        const discriminatorModel = this._resolveDiscriminatorModel(model.type);
        const created = await discriminatorModel.create(ActuatorMapper.mapToSchema(model));
        return ActuatorMapper.mapToModel(created);
    }

    public async upsert(id: string, model: ActuatorModel): Promise<ActuatorModel> {
        const discriminatorModel = this._resolveDiscriminatorModel(model.type);
        const saved = await discriminatorModel.findOneAndUpdate(
            { _id: id },
            ActuatorMapper.mapToSchema(model),
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        return ActuatorMapper.mapToModel(saved);
    }

    public async delete(id: string): Promise<boolean> {
        const deleted = await this.actuatorModel.findByIdAndUpdate(id, softDeleteUpdate());
        if (!deleted) {
            throw new ElementNotFoundExeception(id, 'delete', 'actuator');
        }
        return true;
    }

    public async findById(id: string): Promise<ActuatorModel> {
        const actuator = await this.actuatorModel.findOne({ _id: id, ...NOT_DELETED_FILTER });
        return actuator ? ActuatorMapper.mapToModel(actuator) : null;
    }

    public async findAll(): Promise<ActuatorModel[]> {
        const actuators = await this.actuatorModel.find(NOT_DELETED_FILTER);
        return actuators.map(ActuatorMapper.mapToModel);
    }

    public async findByIds(ids: string[]): Promise<ActuatorModel[]> {
        if (!ids?.length) {
            return [];
        }
        const actuators = await this.actuatorModel.find({ _id: { $in: ids }, ...NOT_DELETED_FILTER });
        return actuators.map(ActuatorMapper.mapToModel);
    }

    // migration one-shot, idempotente et non destructive : les box deployees ont des donnees
    // dans les anciennes collections relay_rpis/relay_coms (avant la fusion en une seule entite
    // "actuator" avec champ discriminant `type`). On ne peut pas se connecter a chaque box pour
    // lancer un script manuel, donc la migration tourne au demarrage de l'app (cf InitService) ;
    // $setOnInsert + upsert par _id garantit qu'un redemarrage ne duplique/n'ecrase rien, et les
    // collections legacy ne sont jamais supprimees (nettoyage manuel ulterieur, hors scope).
    public async migrateLegacyCollections(): Promise<void> {
        const rpiDocs = await this.connection.db.collection(LEGACY_ACTUATOR_RPI_COLLECTION).find().toArray();
        const comDocs = await this.connection.db.collection(LEGACY_ACTUATOR_COM_COLLECTION).find().toArray();
        const valveDocs = await this.connection.db.collection(LEGACY_VALVE_COLLECTION).find().toArray();
        if (!rpiDocs.length && !comDocs.length && !valveDocs.length) {
            return;
        }
        const legacyDocs = [
            ...rpiDocs.map((doc) => ({ ...doc, type: ActuatorType.RPI })),
            ...comDocs.map((doc) => ({ ...doc, type: ActuatorType.COM })),
            ...valveDocs.map((doc) => ActuatorMongooseRepository._mapLegacyValveDoc(doc))
        ];
        for (const doc of legacyDocs) {
            await this.actuatorModel.collection.updateOne(
                { _id: doc._id },
                { $setOnInsert: doc },
                { upsert: true }
            );
        }
        this.logger.log(
            { rpiCount: rpiDocs.length, comCount: comDocs.length, valveCount: valveDocs.length },
            'migrated legacy relay_rpis/relay_coms/valves documents into the actuators collection'
        );
    }

    // les vannes n'avaient ni `status` ni type discriminant CTRL : leur ancien champ `type`
    // (variante de vanne, ex 'PROPORTIONAL') devient `config.valveType`.
    private static _mapLegacyValveDoc(doc: Record<string, unknown>): Record<string, unknown> {
        const { config, type, ...rest } = doc;
        return {
            ...rest,
            type: ActuatorType.CTRL,
            status: ModuleStatus.OFF,
            config: { ...(config as Record<string, unknown>), valveType: type ?? 'PROPORTIONAL' }
        };
    }

}
