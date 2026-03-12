/* eslint-disable max-lines */
/* eslint-disable max-lines-per-function */
import { Injectable, Logger } from '@nestjs/common';
import { StructureRepository } from '@process/infrastructure/repositories/structure.repository';
import { delayWhen, from, map, mergeMap, Observable, of, Subject, Subscription, takeLast, takeUntil, tap, timer } from 'rxjs';
import { SocketIoClientProxyService } from '../../../../common/websocket/socket-io-client-proxy/socket-io-client-proxy.service';
import { ProcessInvalidTypeError } from '../errors/process-invalid-type-error';
import { StructureInvalidError } from '../errors/structure-invalid.error';
import {
    ExecutableAction,
    ExecutableStatus,
    ProcessMode,
    ProcessType
} from '../interfaces/executable.interface';
import { ModuleModel } from '../models/module.model';
import { ProcessModel } from '../models/process.model';
import { StructureService } from './configuration.service';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ScheduleModel } from '../models/schedule.model';
import { CycleModel } from '../models/cycle.model';
import { CycleRepository } from '@process/infrastructure/repositories/cycle.repository';
import { CycleEntity } from '@process/infrastructure/entities/cycle.entity';
import { ExecutableType } from '../models/value.model';
import { ValueRepository } from '@process/infrastructure/repositories/value.repository';
import { ProcessValueEntity } from '@process/infrastructure/entities/process-value.entity';
import { ProcessValueRepository } from '@process/infrastructure/repositories/process-value.repository';
import { SensorValueModel } from '../models/sensor-value.model';
import { ProcessValueModel } from '../models/proccess-value.model';
import * as math from 'mathjs';
import { DataRepository } from '@process/infrastructure/repositories/data.repository';
import { CtrlPwmService } from './pwm-ctrl.service';
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
    ) {

    }

    public async execute(taskId: string, param?: { value: number }): Promise<void> {
        if (!taskId) { 
            console.error("❌ Erreur: un taskId est obligatoire.\n➡️ Exemple: node modbusOneTask.js read_speed");
        }
        const task = await this.modbusTaskRepository.get(taskId);
        const taskModel = ModbusTaskConfigEntity.mapToModel((task as ModbusTaskConfigEntity));
        if (!taskModel) { 
            console.error(`❌ Erreur: aucune tâche trouvée pour taskId "${taskId}"`);
        }

        const connConfig = await this.modbusConnectionRepository.get(taskModel.connectionId);
        const connConfigModel = ModbusConnectionConfigEntity.mapToModel((connConfig as ModbusConnectionConfigEntity ));
        if (!connConfigModel) {
          console.error(`❌ Erreur: aucune connexion trouvée pour "${connConfigModel.id}"`);
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
        
            console.log(`✅ Connecté à ${connConfigModel.id} (${connConfigModel.ipAddress}:${connConfigModel.port})`);
            console.log(`➡️ Exécution de la tâche: ${taskModel.label}`);
        
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
        
              console.log(`🔹 ${taskModel.label}: ${value} ${params.unit || ""}`);
            }
            // --- Écriture ---
            else if (fn.startsWith("write")) {
              if (param.value === undefined) throw new Error("Aucune valeur spécifiée pour l’écriture");
              await client[fn](addr, param.value);
              console.log(`✏️ ${taskModel.label}: écrit ${param.value}`);
            }
        
            // --- Fonction non supportée --- 
            else {
              throw new Error(`Type de fonction non supporté: ${fn}`);
            } 
         
          } catch (err) { 
            console.error(`⚠️ Erreur sur la tâche "${taskId}": ${err.message}`);
          } finally {
            client.close(() => console.log("🔌 Connexion fermée")); 
          }



        if(param){
           //execute vfd
        } else {
           //execute read sensor monitoring ...
        }
    }
   

}

