/* eslint-disable max-lines-per-function */
import { StructureModel } from '@process/domain/models/structure.model';
import { CycleEntity } from './cycle.entity';
import { SensorEntity } from './sensor.entity';
import { ModbusConnectionConfigEntity } from './modbusConnetionConfig.entity';
import { ModbusTaskConfigEntity } from './modbusTaskConfig.entity';
import { InverterEntity } from './inverter.entity';
import { TaskEntity } from './task.entity';
import { ValveEntity } from './valve.entity';

export class StructureEntity extends StructureModel {

    public static mapToModel(structureEntity: StructureEntity): StructureModel {
        const struct: StructureModel = new StructureModel();
        struct.modbusConnections = [];
        struct.modbusTasks = [];
        struct.cycles = [];
        struct.tasks = [];
        struct.sensors = [];
        struct.inverters = [];
        struct.valves = [];
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

        structureEntity.tasks?.forEach((taskData) => {
            struct.tasks.push(TaskEntity.mapToModel(taskData));
        });

        structureEntity.inverters?.forEach((inverter) => {
            struct.inverters.push(InverterEntity.mapToModel(inverter));
        });

        structureEntity.valves?.forEach((valveData) => {
            struct.valves.push(ValveEntity.mapToModel(valveData));
        });

        return struct;
    }

    public static mapToEntity(structureModel: StructureModel): StructureEntity {
        const structure = new StructureEntity();
        structure.modbusConnections = [];
        structure.modbusTasks = [];
        structure.cycles = [];
        structure.tasks = [];
        structure.sensors = [];
        structure.inverters = [];
        structure.valves = [];

        structureModel.sensors.forEach(sensorData => {
            structure.sensors.push(SensorEntity.mapToEntity(sensorData));
        });

        structureModel.cycles.forEach((cycleData) => {
            structure.cycles.push(CycleEntity.mapToEntity(cycleData));
        });

        structureModel.tasks?.forEach((taskData) => {
            structure.tasks.push(TaskEntity.mapToEntity(taskData));
        });

        structureModel.modbusConnections.forEach(modbusConnection => {
            structure.modbusConnections.push(ModbusConnectionConfigEntity.mapToEntity(modbusConnection));
        });

        structureModel.modbusTasks.forEach((modbusTask) => {
            structure.modbusTasks.push(ModbusTaskConfigEntity.mapToEntity(modbusTask));
        });

        structureModel.inverters?.forEach((inverter) => {
            structure.inverters.push(InverterEntity.mapToEntity(inverter));
        });

        structureModel.valves?.forEach((valveData) => {
            structure.valves.push(ValveEntity.mapToEntity(valveData));
        });

        return structure;
    }

}

