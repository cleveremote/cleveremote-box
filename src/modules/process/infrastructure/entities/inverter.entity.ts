import { InverterModel } from '@process/domain/models/inverter.model';

export class InverterEntity extends InverterModel {

    public static mapToModel(entity: InverterEntity): InverterModel {
        const model = new InverterModel();
        model.id = entity.id;
        model.connectionId = entity.connectionId;
        model.device = entity.device;
        model.source = entity.source;
        model.communication = entity.communication;
        model.parameters = entity.parameters;
        return model;
    }

    public static mapToEntity(model: InverterModel): InverterEntity {
        const entity = new InverterEntity();
        entity.id = model.id;
        entity.connectionId = model.connectionId;
        entity.device = model.device;
        entity.source = model.source;
        entity.communication = model.communication;
        entity.parameters = model.parameters;
        return entity;
    }
}
