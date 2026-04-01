import { StructureModel } from '@process/domain/models/structure.model';
import { CycleEntity } from './cycle.entity';
import { SensorEntity } from './sensor.entity';
import { ModbusConnectionConfigEntity } from './modbusConnetionConfig.entity';
import { ModbusTaskConfigEntity } from './modbusTaskConfig.entity';

export class StructureEntity extends StructureModel {

    public static mapToModel(structureEntity: StructureEntity): StructureModel {
        const struct: StructureModel = new StructureModel();
        struct.modbusConnections = [];
        struct.modbusTasks = []; 
        struct.cycles = [];
        struct.sensors = [];
        struct.values= [];
        
        structureEntity.modbusConnections.forEach((modbusConnection) => {
            struct.modbusConnections.push(ModbusConnectionConfigEntity.mapToModel(modbusConnection));
        });

        structureEntity.modbusTasks.forEach((modbusTask) => {
            struct.modbusTasks.push(ModbusTaskConfigEntity.mapToModel(modbusTask));
        });

        structureEntity.sensors.forEach(sensorData => {
            struct.sensors.push(SensorEntity.mapToModel(sensorData));
        });

        structureEntity.cycles.forEach((cycleData) => {
            struct.cycles.push(CycleEntity.mapToModel(cycleData));
        });

        return struct;
    }

    public static mapToEntity(structureModel: StructureModel): StructureEntity {
        const structure = new StructureEntity();
        structure.modbusConnections = [];
        structure.modbusTasks = [];
        structure.cycles = [];
        structure.sensors = [];

        structureModel.sensors.forEach(sensorData => { 
            structure.sensors.push(SensorEntity.mapToEntity(sensorData));
        });

        structureModel.cycles.forEach((cycleData) => {
            structure.cycles.push(CycleEntity.mapToEntity(cycleData));
        });

        structureModel.modbusConnections.forEach(modbusConnection => {
            structure.modbusConnections.push(ModbusConnectionConfigEntity.mapToEntity(modbusConnection));
        });

        structureModel.modbusTasks.forEach((modbusTask) => {
            structure.modbusTasks.push(ModbusTaskConfigEntity.mapToEntity(modbusTask));
        });

        return structure;
    }

}

