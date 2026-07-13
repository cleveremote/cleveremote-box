/* eslint-disable max-lines-per-function */
import { ConditionModel } from '@process/domain/models/condition.model';
import { ComRequestModel } from '@process/domain/models/com-request.model';
import { ConditionEntity } from './condition.entity';

export class ComRequestEntity extends ComRequestModel {

    public static mapToModel(modbusTaskConfigEntity: ComRequestEntity): ComRequestModel {
        const modbusTaskConfigModel = new ComRequestModel();
        modbusTaskConfigModel._id = modbusTaskConfigEntity._id;
        modbusTaskConfigModel.deviceId = modbusTaskConfigEntity.deviceId;
        modbusTaskConfigModel.name = modbusTaskConfigEntity.name;
        modbusTaskConfigModel.type = modbusTaskConfigEntity.type;
        modbusTaskConfigModel.config = modbusTaskConfigEntity.config;
        return modbusTaskConfigModel;
    }

    public static mapToEntity(modbusTaskConfigModel: ComRequestModel): ComRequestEntity {
        const modbusTaskConfigEntity = new ComRequestEntity();
        modbusTaskConfigEntity._id = modbusTaskConfigModel._id;
        modbusTaskConfigEntity.deviceId = modbusTaskConfigModel.deviceId;
        modbusTaskConfigEntity.name = modbusTaskConfigModel.name;
        modbusTaskConfigEntity.type = modbusTaskConfigModel.type;
        modbusTaskConfigEntity.config = modbusTaskConfigModel.config;
        return modbusTaskConfigEntity;
}

}

