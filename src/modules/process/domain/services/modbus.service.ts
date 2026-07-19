/* eslint-disable max-lines */
/* eslint-disable max-lines-per-function */
import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { ComRequestRepository } from '@process/infrastructure/repositories/com-request.repository';
import ModbusRTU from "modbus-serial";
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { DeviceModel, MasterConfigModel, MasterProtocol, SlaveConfigModel } from '@process/domain/models/device.model';
import { ComRequestConfigModel, ComRequestModel, ModbusExecuteResult, ModbusFunctionName } from '@process/domain/models/com-request.model';

export interface InverterConfigParam {
    param: string;
    value: number;
    persist?: boolean;
}

export interface DigitalOutputChange {
    channel: number;
    previous: boolean;
    current: boolean;
}

export interface DigitalInputLongPress {
    channel: number;
    heldMs: number;
}

export interface DigitalMonitorHandle {
    stop: () => Promise<void>;
}

interface QueueEntry {
    comRequest?: ComRequestModel;
    param?: ComRequestConfigModel;
    resolve?: (value?: ModbusExecuteResult | void) => void;
    reject?: (err: Error) => void;
    inverterConfig?: { inverterId: string; params: InverterConfigParam[] };
    run?: () => Promise<void>;
}

@Injectable()
export class ModbusService {
    private _queue: QueueEntry[] = [];
    private _isProcessing = false;

    public constructor(
        private deviceRepository: DeviceRepository,
        private modbusTaskRepository: ComRequestRepository,
        private readonly logger: Logger
    ) { }

    private async _resolveMasterConfig(slaveDeviceId: string): Promise<{ masterConfig: MasterConfigModel; slaveConfig: SlaveConfigModel }> {
        const slaveDevice = await this.deviceRepository.get(slaveDeviceId) as DeviceModel;
        if (!slaveDevice) {
            this.logger.error({ slaveDeviceId }, 'no slave device found');
            return null;
        }
        const slaveConfig = slaveDevice.config as SlaveConfigModel;
        const masterDevice = await this.deviceRepository.get(slaveConfig.masterDeviceId) as DeviceModel;
        if (!masterDevice) {
            this.logger.error({ masterDeviceId: slaveConfig.masterDeviceId }, 'no master device found');
            return null;
        }
        return { masterConfig: masterDevice.config as MasterConfigModel, slaveConfig };
    }

    private async _connectClient(client: ModbusRTU, masterConfig: MasterConfigModel, slaveConfig: SlaveConfigModel): Promise<void> {
        if (masterConfig.protocol === MasterProtocol.TCP) {
            await client.connectTCP(masterConfig.ipAddress, { port: masterConfig.port });
        } else if (masterConfig.protocol === MasterProtocol.RTU) {
            await client.connectRTUBuffered(masterConfig.path, { baudRate: masterConfig.baudRate || 9600 });
        } else {
            throw new Error(`Protocole inconnu: ${masterConfig.protocol}`);
        }
        client.setID(Number(slaveConfig.slaveId));
        client.setTimeout(masterConfig.timeout || 2000);
    }

    public execute(comRequest: ComRequestModel, param?: ComRequestConfigModel): Promise<ModbusExecuteResult | void> {
        return new Promise<ModbusExecuteResult | void>((resolve, reject) => {
            this._queue.push({ comRequest, param, resolve, reject });
            if (!this._isProcessing) this._processQueue();
        });
    }

    public applyInverterConfig(inverterId: string, params: InverterConfigParam[]): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this._queue.push({ inverterConfig: { inverterId, params }, resolve: () => resolve(), reject });
            if (!this._isProcessing) this._processQueue();
        });
    }

    /**
     * Met en file `run` derrière toutes les autres opérations Modbus (tâches d'actionneurs,
     * config onduleur, polling des moniteurs) pour qu'aucune requête ne parte tant qu'une autre
     * n'a pas reçu sa réponse : le bus RS485 partagé derrière la passerelle est half-duplex, deux
     * transactions concurrentes (ex: un poll du moniteur pendant l'écriture d'un actionneur)
     * produisent des trames tronquées/entrelacées ("Data length error") côté modbus-serial.
     */
    private _enqueue<T>(run: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this._queue.push({
                run: async () => {
                    try {
                        resolve(await run());
                    } catch (err) {
                        reject(err);
                    }
                }
            });
            if (!this._isProcessing) this._processQueue();
        });
    }

    private async _processQueue(): Promise<void> {
        if (this._isProcessing || this._queue.length === 0) return;
        this._isProcessing = true;
        while (this._queue.length > 0) {
            const entry = this._queue.shift();
            let result: ModbusExecuteResult | void;
            try {
                if (entry.run) {
                    await entry.run();
                } else if (entry.inverterConfig) {
                    await this._applyInverterConfig(entry.inverterConfig.inverterId, entry.inverterConfig.params);
                } else {
                    result = await this._executeComRequest(entry.comRequest, entry.param);
                }
                entry.resolve?.(result);
            } catch (err) {
                entry.reject?.(err);
            }
        }
        this._isProcessing = false;
    }


    /**
     * Décode tous les flottants IEEE754 (single precision) contenus dans
     * un tableau de registres Modbus, à partir d'une adresse de départ,
     * et applique un facteur d'échelle (scale) sur chaque valeur.
     *
     * Ordre utilisé : low word first, low byte first
     * (selon doc compteur ultrasonique)
     *
     * @param {number[]} registers - Tableau des registres lus (data.data)
     * @param {number} startAddress - Adresse du premier registre lu (ex: 1447)
     * @param {number} length - Nombre de registres lus (ex: 2)
     * @param {number} scale - Facteur d'échelle à appliquer (ex: 1, 0.001, etc.)
     * @returns {Object} Map { adresse: valeurFlottante }
     */
    private decodeFloats(registers, startAddress, length, scale = 1, wordSwap = false) {
        if (registers.length !== length) {
            throw new Error(
                `Le tableau de registres (${registers.length}) ne correspond pas au length (${length})`
            );
        }

        const result = {};

        for (let i = 0; i + 1 < length; i += 2) {
            let reg1 = registers[i];
            let reg2 = registers[i + 1];

            if (wordSwap) {
                [reg1, reg2] = [reg2, reg1];
            }

            const buf = Buffer.alloc(4);
            buf[0] = reg1 & 0xFF;
            buf[1] = (reg1 >> 8) & 0xFF;
            buf[2] = reg2 & 0xFF;
            buf[3] = (reg2 >> 8) & 0xFF;

            const address = startAddress + i;
            result[address] = buf.readFloatLE(0) * scale;
        }

        return result;
    }

    /**
     * Ouvre une connexion Modbus persistante vers `deviceId` et lit périodiquement l'état des
     * `length` premières sorties (Read Coils, adresses 0x0000-0x0007). Ne logue qu'au moment où
     * un ou plusieurs canaux changent d'état, pas à chaque poll.
     */
    public async monitorDigitalOutputs(
        deviceId: string,
        intervalMs = 1000,
        length = 8,
        onChange?: (changes: DigitalOutputChange[]) => void
    ): Promise<DigitalMonitorHandle> {
        const resolved = await this._resolveMasterConfig(deviceId);
        if (!resolved) {
            throw new Error(`monitorDigitalOutputs: no device found for deviceId "${deviceId}"`);
        }
        const { masterConfig, slaveConfig } = resolved;

        const client = new ModbusRTU();
        await this._connectClient(client, masterConfig, slaveConfig);

        let previousStates: boolean[] | null = null;
        let stopped = false;
        let timer: NodeJS.Timeout | null = null;

        const poll = async (): Promise<void> => {
            try {
                // Mise en file derrière les autres opérations Modbus (cf. _enqueue) : sans ça,
                // ce poll et l'écriture d'un actionneur (connexion séparée, cf. _runComRequest)
                // peuvent transiter en même temps sur le bus RS485 partagé et se corrompre
                // mutuellement ("Data length error").
                const states = await this._enqueue(async () => {
                    // La connexion peut avoir été fermée entre deux polls (coupure réseau, reset
                    // de la passerelle, idle timeout...) : modbus-serial ne se reconnecte jamais
                    // tout seul et rejette alors toute requête avec "Port Not Open". On la rouvre ici.
                    if (!client.isOpen) {
                        await this._connectClient(client, masterConfig, slaveConfig);
                    }
                    const result = await client.readCoils(0, length);
                    return result.data.slice(0, length);
                });

                if (!previousStates) {
                    this.logger.log({ deviceId, states }, 'digital output monitor started');
                } else {
                    const changes: DigitalOutputChange[] = [];
                    states.forEach((current, channel) => {
                        if (current !== previousStates[channel]) {
                            changes.push({ channel, previous: previousStates[channel], current });
                        }
                    });
                    if (changes.length > 0) {
                        this.logger.log({ deviceId, changes, states }, 'digital output state changed');
                        onChange?.(changes);
                    }
                }
                previousStates = states;
            } catch (err) {
                this.logger.warn({ deviceId, err: err.message }, 'digital output monitor read failed');
            }
        };

        // setTimeout auto-replanifié plutôt que setInterval : le prochain poll ne démarre
        // qu'une fois le précédent terminé, pour éviter d'empiler des requêtes concurrentes
        // sur la même connexion Modbus si le device répond lentement (source de timeouts en
        // cascade).
        const runPoll = async (): Promise<void> => {
            await poll();
            if (!stopped) {
                timer = setTimeout(runPoll, intervalMs);
            }
        };

        await poll();
        timer = setTimeout(runPoll, intervalMs);

        return {
            stop: () => new Promise<void>((resolve) => {
                stopped = true;
                if (timer) clearTimeout(timer);
                client.close(() => {
                    this.logger.log({ deviceId }, 'digital output monitor stopped');
                    resolve();
                });
            })
        };
    }

    /**
     * Ouvre une connexion Modbus persistante vers `deviceId` et lit périodiquement l'état des
     * `length` premières entrées numériques (Read Discrete Inputs, adresses 0x0000-0x0007, cf.
     * doc Waveshare "Modbus RTU IO 8CH" / RS485 TO POE ETH (B)) pour ne détecter que les appuis
     * longs : si un canal reste à `true` sans interruption pendant au moins `longPressMs`, un
     * événement `DigitalInputLongPress` est loggé et transmis à `onLongPress` (une seule fois
     * par appui, pas à chaque poll une fois le seuil dépassé).
     */
    public async monitorDigitalInputs(
        deviceId: string,
        intervalMs = 1000,
        length = 8,
        longPressMs = 5000,
        onLongPress?: (event: DigitalInputLongPress) => void
    ): Promise<DigitalMonitorHandle> {
        const resolved = await this._resolveMasterConfig(deviceId);
        if (!resolved) {
            throw new Error(`monitorDigitalInputs: no device found for deviceId "${deviceId}"`);
        }
        const { masterConfig, slaveConfig } = resolved;

        const client = new ModbusRTU();
        await this._connectClient(client, masterConfig, slaveConfig);

        // Horodatage du début de l'appui en cours par canal (null = relâché), et flag pour ne
        // déclencher l'événement long-press qu'une seule fois par appui.
        const pressStartedAt: (number | null)[] = new Array(length).fill(null);
        const longPressFired: boolean[] = new Array(length).fill(false);
        let stopped = false;
        let timer: NodeJS.Timeout | null = null;

        const poll = async (): Promise<void> => {
            try {
                // Cf. monitorDigitalOutputs : mise en file derrière les autres opérations Modbus
                // pour ne jamais faire transiter deux transactions en même temps sur le bus
                // RS485 partagé, et reconnexion si la connexion s'est fermée entre deux polls.
                const states = await this._enqueue(async () => {
                    if (!client.isOpen) {
                        await this._connectClient(client, masterConfig, slaveConfig);
                    }
                    const result = await client.readDiscreteInputs(0, length);
                    return result.data.slice(0, length);
                });
                const now = Date.now();

                states.forEach((current, channel) => {
                    if (current) {
                        if (pressStartedAt[channel] === null) {
                            pressStartedAt[channel] = now;
                        } else if (!longPressFired[channel] && now - pressStartedAt[channel] >= longPressMs) {
                            longPressFired[channel] = true;
                            const event: DigitalInputLongPress = { channel, heldMs: now - pressStartedAt[channel] };
                            this.logger.log({ deviceId, ...event }, 'digital input long press detected');
                            onLongPress?.(event);
                        }
                    } else {
                        pressStartedAt[channel] = null;
                        longPressFired[channel] = false;
                    }
                });
            } catch (err) {
                this.logger.warn({ deviceId, err: err.message }, 'digital input monitor read failed');
            }
        };

        // setTimeout auto-replanifié plutôt que setInterval : le prochain poll ne démarre
        // qu'une fois le précédent terminé, pour éviter d'empiler des requêtes concurrentes
        // sur la même connexion Modbus si le device répond lentement (source de timeouts en
        // cascade).
        const runPoll = async (): Promise<void> => {
            await poll();
            if (!stopped) {
                timer = setTimeout(runPoll, intervalMs);
            }
        };

        await poll();
        timer = setTimeout(runPoll, intervalMs);

        return {
            stop: () => new Promise<void>((resolve) => {
                stopped = true;
                if (timer) clearTimeout(timer);
                client.close(() => {
                    this.logger.log({ deviceId }, 'digital input monitor stopped');
                    resolve();
                });
            })
        };
    }

    private async _executeComRequest(comRequest: ComRequestModel, param?: ComRequestConfigModel): Promise<ModbusExecuteResult | void> {
        if (!comRequest) {
            this.logger.error('modbus execute called without comRequest');
        }
        return this._runComRequest(comRequest, param);
    }

    private async _runComRequest(comRequest: ComRequestModel, param?: ComRequestConfigModel): Promise<ModbusExecuteResult | void> {
        const taskId = comRequest?._id;
        const resolved = await this._resolveMasterConfig(comRequest.deviceId);
        if (!resolved) {
            return;
        }
        const { masterConfig, slaveConfig } = resolved;

        const client = new ModbusRTU();


        try {
            // --- Connexion ---
            if (masterConfig.protocol === MasterProtocol.TCP) {
                await client.connectTCP(masterConfig.ipAddress, { port: masterConfig.port });
            } else if (masterConfig.protocol === MasterProtocol.RTU) {
                await client.connectRTUBuffered(masterConfig.path, { baudRate: masterConfig.baudRate || 9600 });
            } else {
                throw new Error(`Protocole inconnu: ${masterConfig.protocol}`);
            }

            client.setID(Number(slaveConfig.slaveId));
            client.setTimeout(masterConfig.timeout || 2000);
            client.setTimeout(2000);

            this.logger.log({ deviceId: comRequest.deviceId, ip: masterConfig.ipAddress, port: masterConfig.port }, 'modbus connected');
            this.logger.log({ task: comRequest.name }, 'executing modbus task');

            const isWrite = param !== undefined;
            let fn: string;
            if (isWrite && Array.isArray(param.params?.value)) {
                // écriture multiple : un tableau de valeurs doit passer par writeCoils/writeRegisters,
                // pas par writeCoil/writeRegister (qui n'acceptent qu'une valeur unique).
                fn = comRequest.config.function.find(f =>
                    f === ModbusFunctionName.WRITE_MULTIPLE_COILS || f === ModbusFunctionName.WRITE_MULTIPLE_REGISTERS
                ) as string || comRequest.config.function.find(f => f.startsWith('write')) as string;
            } else {
                fn = comRequest.config.function.find(f => f.startsWith(isWrite ? 'write' : 'read')) as string;
            }
            if (!fn) throw new Error(`Aucune fonction Modbus ${isWrite ? "d'écriture" : "de lecture"} configurée pour cette tâche`);
            if (typeof client[fn] !== "function") throw new Error(`Fonction Modbus inconnue: ${fn}`);

            const addr = comRequest.config.address;
            const params = comRequest.config.params || null;

            // --- Lecture ---
            if (fn.startsWith("read")) {
                const length = params.length || 1;
                const data = await client[fn](addr, length);
                client.readHoldingRegisters
                if (!data?.data) throw new Error("Aucune donnée reçue");

                // readCoils/readDiscreteInputs renvoient des booléens (états ON/OFF), pas des
                // registres 16 bits : le décodage IEEE754 ne s'applique qu'aux registres.
                if (fn === ModbusFunctionName.READ_COILS || fn === ModbusFunctionName.READ_DISCRETE_INPUTS) {
                    this.logger.log({ label: comRequest.name, value: data.data }, 'modbus read result');
                } else {
                    const values = this.decodeFloats(data.data, addr, length, params.scale, true);
                    this.logger.log({ label: comRequest.name, value: Number(values[addr].toFixed(2)), unit: params?.unit || '' }, 'modbus read result');
                }
                return { function: fn as ModbusFunctionName, result: data } as ModbusExecuteResult;
            }
            // --- Écriture ---
            else if (fn.startsWith("write")) {
                const address = param.params?.persistence?.persist ? param.address+param.params?.persistence?.address: param.address;
                const data = await client[fn](address, param.params.value);
                this.logger.log({ label: comRequest.name, value: param.params.value }, 'modbus write done');
                return { function: fn as ModbusFunctionName, result: data } as ModbusExecuteResult;
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
        const resolved = await this._resolveMasterConfig(inverterId);
        if (!resolved) {
            return;
        }
        const { masterConfig, slaveConfig } = resolved;

        const client = new ModbusRTU();
        try {
            if (masterConfig.protocol === MasterProtocol.TCP) {
                await client.connectTCP(masterConfig.ipAddress, { port: masterConfig.port });
            } else if (masterConfig.protocol === MasterProtocol.RTU) {
                await client.connectRTUBuffered(masterConfig.path, { baudRate: masterConfig.baudRate || 9600 });
            } else {
                throw new Error(`Unknown protocol: ${masterConfig.protocol}`);
            }
            client.setID(Number(slaveConfig.slaveId));
            client.setTimeout(masterConfig.timeout || 2000);

            for (const { param, value, persist } of params) {
                const baseAddress = this._resolveParamAddress(param);
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

    private _resolveParamAddress(paramName: string): number | null {
        const upper = paramName.toUpperCase();
        const match = upper.match(/^F(\d+)\.(\d+)$/);
        if (!match) return null;
        const group = parseInt(match[1], 10);
        const item = parseInt(match[2], 10);
        return group * 256 + item;
    }

}
