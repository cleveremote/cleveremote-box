/* eslint-disable max-lines */
/* eslint-disable max-lines-per-function */
import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { ModbusTaskRepository } from '@process/infrastructure/repositories/modbusTask.repository';
import ModbusRTU from "modbus-serial";
import { ModbusTaskConfigEntity } from '@process/infrastructure/entities/modbusTaskConfig.entity';
import { ModbusConnectionConfigEntity } from '@process/infrastructure/entities/modbusConnetionConfig.entity';
import { ModbusConnectionRepository } from '@process/infrastructure/repositories/modbusConnection.repository';
import { InverterRepository } from '@process/infrastructure/repositories/inverter.repository';
import { InverterModel } from '@process/domain/models/inverter.model';
import { InverterEntity } from '@process/infrastructure/entities/inverter.entity';

export interface InverterConfigParam {
    param: string;
    value: number;
    persist?: boolean;
}

interface QueueEntry {
    taskId?: string;
    param?: { value: number };
    resolve: () => void;
    reject: (err: Error) => void;
    inverterConfig?: { inverterId: string; params: InverterConfigParam[] };
}

@Injectable()
export class ModbusTaskService {
    private _queue: QueueEntry[] = [];
    private _isProcessing = false;

    public constructor(
        private modbusConnectionRepository: ModbusConnectionRepository,
        private modbusTaskRepository: ModbusTaskRepository,
        private inverterRepository: InverterRepository,
        private readonly logger: Logger
    ) {}

    public execute(taskId: string, param?: { value: number }): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this._queue.push({ taskId, param, resolve, reject });
            if (!this._isProcessing) this._processQueue();
        });
    }

    public applyInverterConfig(inverterId: string, params: InverterConfigParam[]): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this._queue.push({ inverterConfig: { inverterId, params }, resolve, reject });
            if (!this._isProcessing) this._processQueue();
        });
    }

    private async _processQueue(): Promise<void> {
        if (this._isProcessing || this._queue.length === 0) return;
        this._isProcessing = true;
        while (this._queue.length > 0) {
            const entry = this._queue.shift();
            try {
                if (entry.inverterConfig) { 
                    await this._applyInverterConfig(entry.inverterConfig.inverterId, entry.inverterConfig.params);
                } else {
                    await this._executeTask(entry.taskId, entry.param); 
                }
                entry.resolve();
            } catch (err) {
                entry.reject(err);
            }
        }
        this._isProcessing = false;
    }

    private async _executeTask(taskId: string, param?: { value: number }): Promise<void> {
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
              if (param.value === undefined) throw new Error("Aucune valeur spécifiée pour l'écriture");
              await client[fn](addr, param.value);
              this.logger.log({ label: taskModel.label, value: param.value }, 'modbus write done');
            }

            // --- Fonction non supportée ---
            else {
              throw new Error(`Type de fonction non supporté: ${fn}`);
            }

          } catch (err) {
            this.logger.error({ taskId, err: err.message }, 'modbus task error');
            const networkCodes = ['EHOSTUNREACH', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'ECONNRESET'];
            if (err.modbusCode !== undefined) return;
            if (!networkCodes.includes(err.code)) {
              throw err;
            }
          } finally {
            client.close(() => this.logger.log({ taskId }, 'modbus connection closed'));
          }
    }

    private async _applyInverterConfig(inverterId: string, params: InverterConfigParam[]): Promise<void> {
        const inverter = await this.inverterRepository.get(inverterId) as InverterEntity;
        if (!inverter) {
            this.logger.error({ inverterId }, 'inverter not found');
            return;
        }
        const connConfig = await this.modbusConnectionRepository.get(inverter.connectionId);
        const connConfigModel = ModbusConnectionConfigEntity.mapToModel(connConfig as ModbusConnectionConfigEntity);

        const client = new ModbusRTU();
        try {
            if (connConfigModel.protocol === 'tcp') {
                await client.connectTCP(connConfigModel.ipAddress, { port: connConfigModel.port });
            } else if (connConfigModel.protocol === 'rtu') {
                await client.connectRTUBuffered(connConfigModel.path, { baudRate: connConfigModel.baudrate || 9600 });
            } else {
                throw new Error(`Unknown protocol: ${connConfigModel.protocol}`);
            }
            client.setID(connConfigModel.slaveId);
            client.setTimeout(connConfigModel.timeout || 2000);

            for (const { param, value, persist } of params) {
                const baseAddress = this._resolveParamAddress(inverter, param);
                if (baseAddress === null) {
                    this.logger.warn({ param }, 'unknown parameter format, skipping');
                    continue;
                }
                // persist=true writes to EEPROM (address + 0x1000) instead of RAM
                const address = persist ? baseAddress + 0x1000 : baseAddress;
                await client.writeRegister(address, value);
                this.logger.log({ param, address: `0x${address.toString(16).toUpperCase()}`, value, persist: !!persist }, 'inverter param written');
            }
        } catch (err) {
            this.logger.error({ inverterId, err: err.message }, 'inverter config error');
            const networkCodes = ['EHOSTUNREACH', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'ECONNRESET'];
            if (err.modbusCode !== undefined) return;
            if (!networkCodes.includes(err.code)) throw err;
        } finally {
            client.close(() => this.logger.log({ inverterId }, 'inverter config connection closed'));
        }
    }

    private _resolveParamAddress(inverter: InverterModel, paramName: string): number | null {
        const upper = paramName.toUpperCase();
        const match = upper.match(/^F(\d+)\.(\d+)$/);
        if (!match) return null;
        const group = parseInt(match[1], 10);
        const item = parseInt(match[2], 10);
        const groupKey = `F${String(group).padStart(2, '0')}`;
        const entry = inverter.parameters?.[groupKey]?.items?.[upper];
        if (entry?.address) return parseInt(entry.address, 16);
        return group * 256 + item;
    }

}
