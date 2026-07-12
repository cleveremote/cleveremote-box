/* eslint-disable max-lines-per-function */
import { StructureModel } from '@process/domain/models/structure.model';
import { CycleEntity } from './cycle.entity';
import { SensorEntity } from './sensor.entity';
import { ComRequestEntity } from './com-request.entity';

export class StructureEntity extends StructureModel {

    public static mapToModel(structureEntity: StructureEntity): StructureModel {
        const struct: StructureModel = new StructureModel();
        struct.modbusTasks = [];
        struct.cycles = [];
        struct.sensors = [];
        struct.values= [];

        structureEntity.modbusTasks.forEach((modbusTask) => {
            struct.modbusTasks.push(ComRequestEntity.mapToModel(modbusTask));
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
        structure.modbusTasks = [];
        structure.cycles = [];
        structure.sensors = [];

        structureModel.sensors.forEach(sensorData => {
            structure.sensors.push(SensorEntity.mapToEntity(sensorData));
        });

        structureModel.cycles.forEach((cycleData) => {
            structure.cycles.push(CycleEntity.mapToEntity(cycleData));
        });

        structureModel.modbusTasks.forEach((modbusTask) => {
            structure.modbusTasks.push(ComRequestEntity.mapToEntity(modbusTask));
        });

        return structure;
    }

}
