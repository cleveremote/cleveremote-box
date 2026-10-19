import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import ModbusRTU from 'modbus-serial';
import { ModbusConnection, ModbusTransport } from '../models/modbus-connection.model';
import { RegisterFunction, RegisterRawData, RegisterRequest } from '../models/register-map.model';

const UNREACHABLE_CODES = ['EHOSTUNREACH', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH'];
const DEFAULT_TIMEOUT = 2000;
const DEFAULT_BAUD_RATE = 9600;

/**
 * Exécution technique de requêtes Modbus brutes. Le bus RS485 est half-duplex : toutes les
 * transactions passent par une file unique (une requête concurrente se ferait écraser).
 * Les erreurs (exceptions Modbus comprises, cf. err.modbusCode) sont propagées.
 */
@Injectable()
export class ModbusBusService {
    // Fin de la dernière transaction en file : chaque nouvelle transaction s'y enchaîne
    private _tail: Promise<void> = Promise.resolve();

    public constructor(private readonly logger: Logger) { }

    /** Lecture : données lues (bits tronqués à `length`) ; écriture : rien */
    public execute(connection: ModbusConnection, request: RegisterRequest): Promise<RegisterRawData> {
        return this.runExclusive(async () => {
            const client = new ModbusRTU();
            await this._connect(client, connection);
            try {
                return await this._run(client, connection.unitId, request);
            } finally {
                client.close(() => this.logger.debug({ unitId: connection.unitId }, 'register request connection closed'));
            }
        });
    }

    /** Exécute `run` seul sur le bus, à la suite des transactions en attente */
    public runExclusive<T>(run: () => Promise<T>): Promise<T> {
        const result = this._tail.then(run);
        this._tail = result.then(() => undefined, () => undefined);
        return result;
    }

    private async _connect(client: ModbusRTU, connection: ModbusConnection): Promise<void> {
        if (connection.transport === ModbusTransport.TCP) {
            try {
                await client.connectTCP(connection.host, { port: connection.port });
            } catch (err) {
                // Adresse obsolète : l'appelant peut fournir une connexion corrigée, retentée une fois
                const retry = UNREACHABLE_CODES.includes(err.code) ? await connection.onUnreachable?.() : undefined;
                if (!retry) {
                    throw err;
                }
                await client.connectTCP(retry.host, { port: retry.port });
            }
        } else if (connection.transport === ModbusTransport.RTU) {
            await client.connectRTUBuffered(connection.path, { baudRate: connection.baudRate || DEFAULT_BAUD_RATE });
        } else {
            throw new Error(`Transport Modbus inconnu: ${connection.transport}`);
        }
        client.setID(connection.unitId);
        client.setTimeout(connection.timeout || DEFAULT_TIMEOUT);
    }

    private async _run(client: ModbusRTU, unitId: number, request: RegisterRequest): Promise<RegisterRawData> {
        const { address, length } = request;
        switch (request.function) {
            case RegisterFunction.READ_COILS:
            case RegisterFunction.READ_DISCRETE_INPUTS:
                // modbus-serial complète les bits au multiple de 8
                return (await client[request.function](address, length)).data.slice(0, length);
            case RegisterFunction.READ_HOLDING_REGISTERS:
            case RegisterFunction.READ_INPUT_REGISTERS:
                return (await client[request.function](address, length)).data;
            case RegisterFunction.CUSTOM_SINGLE_COIL:
            case RegisterFunction.CUSTOM_MULTIPLE_COILS: {
                const count = request.function === RegisterFunction.CUSTOM_SINGLE_COIL ? 1 : length;
                for (let i = 0; i < count; i++) {
                    await this._customCoil(client, unitId, address + i, request.value as number);
                }
                return;
            }
            default:
                return this._write(client, request);
        }
    }

    private async _write(client: ModbusRTU, request: RegisterRequest): Promise<void> {
        const { address, value } = request;
        switch (request.function) {
            case RegisterFunction.WRITE_SINGLE_COIL:
                await client.writeCoil(address, Boolean(value));
                return;
            case RegisterFunction.WRITE_SINGLE_REGISTER:
                await client.writeRegister(address, value as number);
                return;
            case RegisterFunction.WRITE_MULTIPLE_COILS:
                await client.writeCoils(address, value as boolean[]);
                return;
            case RegisterFunction.WRITE_MULTIPLE_REGISTERS:
                await client.writeRegisters(address, value as number[]);
                return;
            default:
                throw new Error(`Fonction Modbus non supportée: ${request.function}`);
        }
    }

    // FC05 avec une valeur 16 bits custom (ex: 0x5500 = toggle) : writeCoil ne sait émettre que FF00/0000.
    // L'écho est décodé par modbus-serial comme un writeCoil (state=false), on l'ignore.
    private async _customCoil(client: ModbusRTU, unitId: number, address: number, value: number): Promise<void> {
        const data = Buffer.from([(address >> 8) & 0xff, address & 0xff, (value >> 8) & 0xff, value & 0xff]);
        await new Promise<void>((resolve, reject) => {
            client.writeCustomFC(unitId, 0x05, data as unknown as Int8Array, (err) => (err ? reject(err) : resolve()));
        });
    }
}
