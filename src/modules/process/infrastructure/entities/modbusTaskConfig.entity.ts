/* eslint-disable max-lines-per-function */
import { ConditionModel } from '@process/domain/models/condition.model';
import { ModbusTaskConfigModel } from '@process/domain/models/modbusTaskConfig.model';
import { ConditionEntity } from './condition.entity';

export class ModbusTaskConfigEntity extends ModbusTaskConfigModel {

    public static mapToModel(modbusTaskConfigEntity: ModbusTaskConfigEntity): ModbusTaskConfigModel {
        const modbusTaskConfigModel = new ModbusTaskConfigModel();
        modbusTaskConfigModel.id = modbusTaskConfigEntity.id;
        modbusTaskConfigModel.connectionId=modbusTaskConfigEntity.connectionId;
        modbusTaskConfigModel.function=modbusTaskConfigEntity.function;
        modbusTaskConfigModel.label=modbusTaskConfigEntity.label;
        modbusTaskConfigModel.address=modbusTaskConfigEntity.address;
        modbusTaskConfigModel.params=modbusTaskConfigEntity.params;
        return modbusTaskConfigModel;
    }

    public static mapToEntity(modbusTaskConfigModel: ModbusTaskConfigModel): ModbusTaskConfigEntity {
        const modbusTaskConfigEntity = new ModbusTaskConfigEntity();
        modbusTaskConfigEntity.id = modbusTaskConfigModel.id;
        modbusTaskConfigEntity.connectionId=modbusTaskConfigModel.connectionId;
        modbusTaskConfigEntity.function=modbusTaskConfigModel.function;
        modbusTaskConfigEntity.label=modbusTaskConfigModel.label;
        modbusTaskConfigEntity.address=modbusTaskConfigModel.address;
        modbusTaskConfigEntity.params=modbusTaskConfigModel.params;
        return modbusTaskConfigEntity;
}

}

