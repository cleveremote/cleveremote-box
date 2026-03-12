/* eslint-disable max-lines-per-function */

import { ModbusConnectionConfigModel } from '@process/domain/models/modbusConnectionConfig.model';

export class ModbusConnectionConfigEntity extends ModbusConnectionConfigModel {

    public static mapToModel(modbusConnectionConfigEntity: ModbusConnectionConfigEntity): ModbusConnectionConfigModel {
        const modbusConnectionConfigModel = new ModbusConnectionConfigModel();
        modbusConnectionConfigModel.id = modbusConnectionConfigEntity.id;
        modbusConnectionConfigModel.ipAddress=modbusConnectionConfigEntity.ipAddress;
        modbusConnectionConfigModel.port=modbusConnectionConfigEntity.port;
        modbusConnectionConfigModel.protocol=modbusConnectionConfigEntity.protocol;
        modbusConnectionConfigModel.slaveId=modbusConnectionConfigEntity.slaveId;
        modbusConnectionConfigModel.timeout=modbusConnectionConfigEntity.timeout;
        modbusConnectionConfigModel.path=modbusConnectionConfigEntity.path;
        modbusConnectionConfigModel.baudrate=modbusConnectionConfigEntity.baudrate;
        return modbusConnectionConfigModel;
    }

    public static mapToEntity(modbusConnectionConfigModel: ModbusConnectionConfigModel): ModbusConnectionConfigEntity {
        const modbusConnectionConfigEntity = new ModbusConnectionConfigEntity();
        modbusConnectionConfigEntity.id = modbusConnectionConfigModel.id;
        modbusConnectionConfigEntity.ipAddress=modbusConnectionConfigModel.ipAddress;
        modbusConnectionConfigEntity.port=modbusConnectionConfigModel.port;
        modbusConnectionConfigEntity.protocol=modbusConnectionConfigModel.protocol;
        modbusConnectionConfigEntity.timeout=modbusConnectionConfigModel.timeout;
        modbusConnectionConfigEntity.path=modbusConnectionConfigModel.path;
        modbusConnectionConfigEntity.baudrate=modbusConnectionConfigModel.baudrate;
        return modbusConnectionConfigEntity;
}

}

