/* eslint-disable max-lines */
/* eslint-disable max-lines-per-function */
import { Injectable, BadRequestException } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { ComRequestRepository } from '@process/infrastructure/repositories/com-request.repository';
import ModbusRTU from "modbus-serial";
import { create, all, MathNode, EvalFunction } from 'mathjs';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { DeviceModel, DeviceKind, DeviceType, MasterConfigModel, MasterProtocol, SlaveConfigModel } from '@process/domain/models/device.model';
import {
    ComRequestConfigModel, ComRequestModel, ModbusEvaluatedReading, ModbusExecuteResult, ModbusFunctionName, ModbusValueType
} from '@process/domain/models/com-request.model';
import { DEFAULT_UNCONFIGURED_UNIT_ID } from '@process/domain/utils/modbus-registers.util';

/** Longueur par défaut (en registres) appliquée quand params.length est absent et config.type est défini */
const DEFAULT_LENGTH_BY_TYPE: Record<ModbusValueType, number> = {
    [ModbusValueType.CUMULATIVE]: 4,
    [ModbusValueType.FLOAT]: 2,
    [ModbusValueType.UINT32]: 2,
    [ModbusValueType.INT]: 1,
    [ModbusValueType.FLOAT_6_BYTES]: 3,
};

/** REG1439, position du point décimal utilisée par les formules cumulative du compteur d'eau ultrasonique */
const DECIMAL_POSITION_REGISTER = 1439;

interface CompiledFormula {
    code: EvalFunction;
    variables: string[];
}

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

    // Moteur de formules mathjs (cf. _compileFormula/evaluateScale) et cache de la position
    // décimale (REG1439) par device, utilisés uniquement pour les ComRequest avec config.type défini.
    private readonly _math = create(all);
    private readonly _formulaCache = new Map<string, CompiledFormula>();
    // Référence conservée avant désactivation de math.parse (cf. constructeur) : sans elle,
    // _compileFormula ne pourrait plus parser aucune formule, y compris les siennes.
    private readonly _parseFormula = this._math.parse.bind(this._math);
    private readonly _decimalPositionByDevice = new Map<string, number>();

    public constructor(
        private deviceRepository: DeviceRepository,
        private modbusTaskRepository: ComRequestRepository,
        private readonly logger: Logger
    ) {
        // Instance mathjs restreinte : formules stockables (ComRequest.config.params.formula)
        // sans risque d'injection.
        this._math.import(
            {
                import: () => { throw new Error('désactivé'); },
                createUnit: () => { throw new Error('désactivé'); },
                evaluate: () => { throw new Error('désactivé'); },
                parse: () => { throw new Error('désactivé'); }
            },
            { override: true }
        );
    }

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

    private async _connectClient(client: ModbusRTU, masterConfig: MasterConfigModel, unitId: number): Promise<void> {
        if (masterConfig.protocol === MasterProtocol.TCP) {
            await client.connectTCP(masterConfig.ipAddress, { port: masterConfig.port });
        } else if (masterConfig.protocol === MasterProtocol.RTU) {
            await client.connectRTUBuffered(masterConfig.path, { baudRate: masterConfig.baudRate || 9600 });
        } else {
            throw new Error(`Protocole inconnu: ${masterConfig.protocol}`);
        }
        client.setID(unitId);
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

    // -------------------------------------------------------------------------
    // Décodage type-aware (ModbusValueType) + formules mathjs (config.type défini)
    // -------------------------------------------------------------------------
    private _toFloat6Bytes(registers): number {
        const buf = Buffer.alloc(6);
        buf.writeUInt16BE(registers[0], 0);
        buf.writeUInt16BE(registers[1], 2);
        buf.writeUInt16BE(registers[2], 4);
        const integerPart = buf.readUInt32BE(0);
        const decimalPart = buf.readUInt16BE(4);
        return integerPart + decimalPart / 100;
    }

    private _toFloat(w: number[]): number {
        const b = Buffer.alloc(4);
        b.writeUInt16BE(w[1], 0);
        b.writeUInt16BE(w[0], 2);
        return b.readFloatBE(0);
    }

    private _toLong(w: number[]): number {
        const b = Buffer.alloc(4);
        b.writeUInt16BE(w[1], 0);
        b.writeUInt16BE(w[0], 2);
        return b.readInt32BE(0);
    }

    private _toUint32(w: number[]): number {
        const b = Buffer.alloc(4);
        b.writeUInt16BE(w[1], 0);
        b.writeUInt16BE(w[0], 2);
        return b.readUInt32BE(0);
    }

    private _toInt16(word: number): number {
        return word > 0x7fff ? word - 0x10000 : word;
    }

    /**
     * Position du point décimal (REG1439), nécessaire aux formules cumulative. C'est un
     * paramètre de configuration du compteur qui ne change quasiment jamais → lu une fois par
     * device puis mis en cache. Appelez refreshDecimalPosition(deviceId) si ce réglage change.
     */
    private async _getDecimalPosition(client: ModbusRTU, deviceId: string): Promise<number> {
        if (!this._decimalPositionByDevice.has(deviceId)) {
            const res = await client.readHoldingRegisters(DECIMAL_POSITION_REGISTER - 1, 1);
            this._decimalPositionByDevice.set(deviceId, this._toInt16(res.data[0]));
        }
        return this._decimalPositionByDevice.get(deviceId);
    }

    public async refreshDecimalPosition(deviceId: string): Promise<number> {
        this._decimalPositionByDevice.delete(deviceId);
        const resolved = await this._resolveMasterConfig(deviceId);
        if (!resolved) {
            throw new Error(`refreshDecimalPosition: no device found for deviceId "${deviceId}"`);
        }
        const { masterConfig, slaveConfig } = resolved;
        const client = new ModbusRTU();
        return this._enqueue(async () => {
            await this._connectClient(client, masterConfig, slaveConfig.slaveId);
            try {
                return await this._getDecimalPosition(client, deviceId);
            } finally {
                client.close(() => this.logger.log({ deviceId }, 'decimal position refresh connection closed'));
            }
        });
    }

    /** Test : REG0361 doit renvoyer 361.0 (sinon décalage d'adresse probable) */
    public async testCommunication(deviceId: string): Promise<{ value: number; ok: boolean }> {
        const resolved = await this._resolveMasterConfig(deviceId);
        if (!resolved) {
            throw new Error(`testCommunication: no device found for deviceId "${deviceId}"`);
        }
        const { masterConfig, slaveConfig } = resolved;
        const client = new ModbusRTU();
        return this._enqueue(async () => {
            await this._connectClient(client, masterConfig, slaveConfig.slaveId);
            try {
                const res = await client.readHoldingRegisters(360, 2);
                const value = this._toFloat(res.data);
                return { value, ok: Math.abs(value - 361.0) < 0.01 };
            } finally {
                client.close(() => this.logger.log({ deviceId }, 'test communication connection closed'));
            }
        });
    }

    /** Changement d'adresse esclave : REG0062 inscriptible, max 255 (FC06) */
    public async changeSlaveAddress(deviceId: string, newAddress: number): Promise<boolean> {
        if (newAddress < 1 || newAddress > 255) {
            throw new BadRequestException('Adresse : 1 à 255');
        }
        const resolved = await this._resolveMasterConfig(deviceId);
        if (!resolved) {
            throw new Error(`changeSlaveAddress: no device found for deviceId "${deviceId}"`);
        }
        const { masterConfig, slaveConfig } = resolved;
        const client = new ModbusRTU();
        const isOk = await this._enqueue(async () => {
            await this._connectClient(client, masterConfig, slaveConfig.slaveId);
            try {
                await client.writeRegister(61, newAddress); // REG0062 → adresse 61
                client.setID(newAddress);
                const res = await client.readHoldingRegisters(360, 2);
                const value = this._toFloat(res.data);
                return Math.abs(value - 361.0) < 0.01;
            } finally {
                client.close(() => this.logger.log({ deviceId }, 'change slave address connection closed'));
            }
        });
        this.logger.log({ deviceId, newAddress, ok: isOk }, 'slave address changed');
        return isOk;
    }

    /** Changement d'adresse esclave : REG0062 inscriptible, max 255 (FC06) */
    public async setSlaveAdress(masterDevice: DeviceModel, slaveAddressRegister: number, currentAdress: number, newAddress: number): Promise<boolean> {
        if (newAddress < 1 || newAddress > 255) {
            throw new BadRequestException('Adresse : 1 à 255');
        }

        const client = new ModbusRTU();
        const isOk = await this._enqueue(async () => {
            await this._connectClient(client, masterDevice.config as MasterConfigModel, currentAdress);
            try {
                await client.writeRegister(slaveAddressRegister, newAddress); // REG0062 → adresse 61
                client.setID(newAddress);
            } finally {
                client.close(() => this.logger.log({ deviceId: masterDevice._id }, 'change slave address connection closed'));
                return true;
            }
        });
        this.logger.log({ deviceId: masterDevice._id, newAddress, ok: isOk }, 'slave address changed');
        return isOk;
    }

    private _compileFormula(expr: string): CompiledFormula {
        let compiled = this._formulaCache.get(expr);
        if (!compiled) {
            let node: MathNode;
            try {
                node = this._parseFormula(expr);
            } catch (e) {
                throw new BadRequestException(
                    `Formule invalide "${expr}" : ${(e as Error).message}`
                );
            }
            // MathNode.filter() ne typifie pas ses sous-classes (SymbolNode.name/isSymbolNode) :
            // any est requis ici pour accéder à ces propriétés spécifiques.
            /* eslint-disable @typescript-eslint/no-explicit-any */
            compiled = {
                code: node.compile(),
                variables: node
                    .filter((x: any) => x.isSymbolNode && !(this._math as any)[x.name])
                    .map((x: any) => x.name as string)
            };
            /* eslint-enable @typescript-eslint/no-explicit-any */
            this._formulaCache.set(expr, compiled);
        }
        return compiled;
    }

    /** Exécute une formule avec un scope fourni à la main (test sans device) */
    public evaluateScale(expr: string, scope: Record<string, number>): number {
        return this._compileFormula(expr).code.evaluate(scope);
    }

    /**
     * Décode `words` selon config.type puis évalue config.params.formula (défaut : 'raw').
     * `client` doit être déjà connecté (réutilisé pour l'éventuelle lecture REG1439 des
     * cumulative, afin de ne jamais ouvrir une seconde connexion pendant une transaction déjà
     * mise en file par _runComRequest).
     */
    // eslint-disable-next-line complexity
    private async _evaluateReading(
        client: ModbusRTU,
        deviceId: string,
        config: ComRequestConfigModel,
        words: number[]
    ): Promise<ModbusEvaluatedReading> {
        const type = config.type ?? ModbusValueType.INT;
        const formula = config.params?.formula ?? 'raw';
        const scope: Record<string, number> = {};

        switch (type) {
            case ModbusValueType.CUMULATIVE:
                // words[0..1] = LONG, words[2..3] = fraction IEEE754 (contigus)
                scope.N = this._toLong(words.slice(0, 2));
                scope.Nf = words.length >= 4 ? this._toFloat(words.slice(2, 4)) : 0;
                scope.n = await this._getDecimalPosition(client, deviceId); // REG1439, mis en cache par device
                break;
            case ModbusValueType.FLOAT:
                scope.raw = this._toFloat(words);
                break;
            case ModbusValueType.FLOAT_6_BYTES:
                scope.raw = this._toFloat6Bytes(words);
                break;
            case ModbusValueType.UINT32:
                scope.raw = this._toUint32(words);
                break;
            case ModbusValueType.INT:
            default:
                scope.raw = this._toInt16(words[0]);
        }

        const { variables } = this._compileFormula(formula);
        const missing = variables.filter((v) => !(v in scope));
        if (missing.length) {
            throw new BadRequestException(
                `Formule "${formula}" : variables manquantes [${missing.join(', ')}]`
            );
        }

        return { formula, scope, value: this.evaluateScale(formula, scope) };
    }

    /** Ouvre une connexion Modbus persistante vers `deviceId` et lit périodiquement l'état des
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
        await this._connectClient(client, masterConfig, slaveConfig.slaveId);

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
                        await this._connectClient(client, masterConfig, slaveConfig.slaveId);
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
        await this._connectClient(client, masterConfig, slaveConfig.slaveId);

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
                        await this._connectClient(client, masterConfig, slaveConfig.slaveId);
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

    /**
     * Effectue un seul cycle de sonde de découverte pour ce Master : tente chaque registre de
     * discoveryRegisters (unit id DEFAULT_UNCONFIGURED_UNIT_ID) jusqu'au premier qui répond, et
     * provisionne immédiatement le module détecté. Ne gère aucune récurrence ni aucun état entre
     * deux appels - c'est à l'appelant (le watch loop de DeviceService) de rappeler cette méthode
     * périodiquement pour chaque Master.
     */
    public async probeMasterForNewSlave(master: DeviceModel): Promise<number> {
        const masterConfig = master.config as MasterConfigModel;
        // opt-in par Master : sans discoveryRegisters renseigné, pas de sonde (pas de fallback
        // silencieux sur un registre par défaut) - cf. modbus-registers.util.ts.
        const registersToProbe = masterConfig.discoveryRegisters ?? [];
        if (registersToProbe.length === 0) return;

        const networkCodes = ['EHOSTUNREACH', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'ECONNRESET'];
        const client = new ModbusRTU();
        const detectedRegister = await this._enqueue(async () => {
            try {
                await this._connectClient(client, masterConfig, DEFAULT_UNCONFIGURED_UNIT_ID);
                // Timeout court dédié à la sonde : on ne veut pas bloquer les autres
                // transactions en file quand rien ne répond (cas nominal, à chaque poll).
                client.setTimeout(200);
                // Un seul connect pour tous les registres de la liste : on les essaie l'un
                // après l'autre sur la même connexion déjà ouverte, jusqu'au premier qui répond.
                for (const register of registersToProbe) {
                    try {
                        await client.readHoldingRegisters(register, 1);
                        client.setTimeout(masterConfig.timeout || 2000);
                        this.logger.log({ masterId: master._id, register: detectedRegister }, 'new unconfigured modbus slave detected');
                        return register;
                    } catch (err) {
                        // cas nominal : ce registre ne répond pas - on essaie le suivant sans
                        // remonter d'erreur (cf. watchForNewDevice d'origine:
                        // `catch { /* aucun nouveau module */ }`).
                        if (err.modbusCode === undefined && !networkCodes.includes(err.code)) {
                            this.logger.warn({ masterId: master._id, register, err: err.message }, 'slave discovery probe failed unexpectedly');
                        }
                    }
                }
                client.setTimeout(masterConfig.timeout || 2000);
                return null;
            } catch (err) {
                this.logger.warn({ masterId: master._id, err: err.message }, 'slave discovery connection failed');
                return null;
            }
        });
        client.close();
        return detectedRegister;

    }
  

    private async _executeComRequest(comRequest: ComRequestModel, param?: ComRequestConfigModel): Promise<ModbusExecuteResult | void> {
        if (!comRequest) {
            this.logger.error('modbus execute called without comRequest');
        }
        return this._runComRequest(comRequest, param);
    }

    // eslint-disable-next-line complexity
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

            client.setID(slaveConfig.slaveId);
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
            const type = comRequest.config.type;

            // --- Lecture ---
            if (fn.startsWith("read")) {
                const length = params.length || (type ? DEFAULT_LENGTH_BY_TYPE[type] : 1);
                const data = await client[fn](addr, length);
                if (!data?.data) throw new Error("Aucune donnée reçue");

                // readCoils/readDiscreteInputs renvoient des booléens (états ON/OFF), pas des
                // registres 16 bits : le décodage ne s'applique qu'aux registres.
                if (fn === ModbusFunctionName.READ_COILS || fn === ModbusFunctionName.READ_DISCRETE_INPUTS) {
                    this.logger.log({ label: comRequest.name, value: data.data }, 'modbus read result');
                } else if (type !== undefined) {
                    // config.type défini : décodage type-aware + formule mathjs (cf. _evaluateReading),
                    // remplace le décodage IEEE754 générique ci-dessous pour ce ComRequest.
                    data.evaluated = await this._evaluateReading(client, comRequest.deviceId, comRequest.config, data.data);
                    const evaluatedValue = Number(data.evaluated.value.toFixed(2));
                    this.logger.log({ label: comRequest.name, value: evaluatedValue, unit: params?.unit || '' }, 'modbus read result');
                } else {
                    const values = this.decodeFloats(data.data, addr, length, params.scale, true);
                    this.logger.log({ label: comRequest.name, value: Number(values[addr].toFixed(2)), unit: params?.unit || '' }, 'modbus read result');
                }
                return { function: fn as ModbusFunctionName, result: data } as ModbusExecuteResult;
            }
            // --- Écriture ---
            else if (fn.startsWith("write")) {
                const address = param.params?.persistence?.persist ? param.address + param.params?.persistence?.address : param.address;
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
            client.setID(slaveConfig.slaveId);
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
