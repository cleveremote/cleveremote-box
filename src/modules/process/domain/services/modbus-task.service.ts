/* eslint-disable max-lines */
/* eslint-disable max-lines-per-function */
import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { ModbusTaskRepository } from '@process/infrastructure/repositories/modbusTask.repository';
import ModbusRTU from "modbus-serial";
import { ModbusTaskConfigEntity } from '@process/infrastructure/entities/modbusTaskConfig.entity';
import { ModbusConnectionConfigEntity } from '@process/infrastructure/entities/modbusConnetionConfig.entity';
import { ModbusConnectionRepository } from '@process/infrastructure/repositories/modbusConnection.repository';

@Injectable()
export class ModbusTaskService {
    public constructor(
        private modbusConnectionRepository: ModbusConnectionRepository,
        private modbusTaskRepository: ModbusTaskRepository,
        private readonly logger: Logger
    ) {

    }

    public async execute(taskId: string, param?: { value: number }): Promise<void> {
        if (!taskId) {
            this.logger.error('modbus execute called without taskId');
        }
        const task = await this.modbusTaskRepository.get(taskId);
        const taskModel = ModbusTaskConfigEntity.mapToModel((task as ModbusTaskConfigEntity));
        if (!taskModel) {
            this.logger.error({ taskId }, 'no modbus task found for taskId');
        }

        const connConfig = await this.modbusConnectionRepository.get(taskModel.connectionId);
        const connConfigModel = ModbusConnectionConfigEntity.mapToModel((connConfig as ModbusConnectionConfigEntity ));
        if (!connConfigModel) {
            this.logger.error({ connectionId: taskModel.connectionId }, 'no modbus connection config found');
        }

        const client = new ModbusRTU();
        
        
        try {
            // --- Connexion ---
            if (connConfigModel.protocol === "tcp") {
              await client.connectTCP(connConfigModel.ipAddress, { port: connConfigModel.port });
            } else if (connConfigModel.protocol === "rtu") {
              await client.connectRTUBuffered(connConfigModel.path, { baudRate: connConfigModel.baudrate || 9600 });
            } else {
              throw new Error(`Protocole inconnu: ${connConfigModel.protocol}`);
            }
        
            client.setID(connConfigModel.slaveId);
            client.setTimeout(connConfigModel.timeout || 2000);
        
            this.logger.log({ connectionId: connConfigModel.id, ip: connConfigModel.ipAddress, port: connConfigModel.port }, 'modbus connected');
            this.logger.log({ task: taskModel.label }, 'executing modbus task');
        
            const fn = taskModel.function;
            if (typeof client[fn] !== "function") throw new Error(`Fonction Modbus inconnue: ${fn}`);
         
            const addr = taskModel.address;
            const params = taskModel.params || null;
            let result;
        
            // --- Lecture ---
            if (fn.startsWith("read")) {
              const length = params.length || 1;
              result = await client[fn](addr, length);
              if (!result?.data) throw new Error("Aucune donnée reçue");
        
              const raw = result.data;
              let value = raw[0];
              if (length === 2 && Array.isArray(raw)) value = (raw[0] << 16) | raw[1];
              if (params.scale) value *= params.scale;
        
              this.logger.log({ label: taskModel.label, value, unit: params.unit || '' }, 'modbus read result');
            }
            // --- Écriture ---
            else if (fn.startsWith("write")) {
              if (param.value === undefined) throw new Error("Aucune valeur spécifiée pour l’écriture");
              await client[fn](addr, param.value);
              this.logger.log({ label: taskModel.label, value: param.value }, 'modbus write done');
            }
        
            // --- Fonction non supportée --- 
            else {
              throw new Error(`Type de fonction non supporté: ${fn}`);
            } 
         
          } catch (err) {
            this.logger.error({ taskId, err: err.message }, 'modbus task error');
          } finally {
            client.close(() => this.logger.log({ taskId }, 'modbus connection closed'));
          }



        if(param){
           //execute vfd
        } else {
           //execute read sensor monitoring ...
        }
    }
   

}

