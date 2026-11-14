import { createServer, Server, Socket } from 'node:net';
import { Logger } from 'nestjs-pino';
import { ModbusExceptionCode, ModbusExceptionError, ModbusTable, WriteResult } from '../models/simulated-device.model';
import { SimulatedDevice } from './simulated-device';

// En-tête MBAP : transaction id (2), protocol id (2), longueur (2), unit id (1)
const MBAP_HEADER_LENGTH = 7;
// Longueur max (unit id + PDU) d'une trame Modbus TCP
const MAX_MBAP_LENGTH = 254;
const EXCEPTION_FLAG = 0x80;

enum FunctionCode {
    READ_COILS = 0x01,
    READ_DISCRETE_INPUTS = 0x02,
    READ_HOLDING_REGISTERS = 0x03,
    READ_INPUT_REGISTERS = 0x04,
    WRITE_SINGLE_COIL = 0x05,
    WRITE_SINGLE_REGISTER = 0x06,
    WRITE_MULTIPLE_COILS = 0x0F,
    WRITE_MULTIPLE_REGISTERS = 0x10
}

// Quantités max par requête (spécification Modbus) : lecture bits / registres, écriture bits / registres
const [MAX_READ_BITS, MAX_READ_REGISTERS, MAX_WRITE_BITS, MAX_WRITE_REGISTERS] = [2000, 125, 1968, 123];

export interface ModbusTcpServerHandlers {
    // Équipement actif à cette adresse ; undefined = rien ne répond (comme sur un vrai bus)
    resolve: (unitId: number) => SimulatedDevice | undefined;
    // Après une écriture (réponse envoyée, réadressage appliqué)
    onWrite: (device: SimulatedDevice, isReaddressed: boolean) => void;
}

interface PduResult {
    response: Buffer;
    write?: WriteResult;
}

/**
 * Passerelle Modbus TCP (MBAP) simulée : route chaque requête vers l'équipement simulé dont l'unit id correspond.
 * Un unit id sans équipement ne reçoit aucune réponse (le client part en timeout). Plusieurs clients simultanés acceptés
 * (le scan ouvre sa propre connexion à côté de celle du pool).
 */
export class ModbusTcpServer {
    private _server?: Server;
    private readonly _sockets = new Set<Socket>();

    public constructor(private readonly handlers: ModbusTcpServerHandlers, private readonly logger: Logger) { }

    public start(host: string, port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const server = createServer((socket) => this._accept(socket));
            server.once('error', reject);
            server.listen(port, host, () => {
                server.off('error', reject);
                server.on('error', (err) => this.logger.error({ err: err.message }, 'simulator server error'));
                this._server = server;
                resolve();
            });
        });
    }

    public stop(): Promise<void> {
        const server = this._server;
        this._server = undefined;
        this._sockets.forEach((socket) => socket.destroy());
        this._sockets.clear();
        return new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()));
    }

    private _accept(socket: Socket): void {
        this._sockets.add(socket);
        const peer = `${socket.remoteAddress}:${socket.remotePort}`;
        this.logger.debug({ peer }, 'simulator client connected');
        let buffer: Buffer = Buffer.alloc(0);
        socket.on('data', (chunk) => {
            buffer = this._consumeFrames(socket, peer, Buffer.concat([buffer, chunk]));
        });
        socket.on('error', (err) => this.logger.debug({ peer, err: err.message }, 'simulator client error'));
        socket.on('close', () => {
            this._sockets.delete(socket);
            this.logger.debug({ peer }, 'simulator client disconnected');
        });
    }

    // Traite les trames complètes de `buffer` et renvoie le reste (trame incomplète)
    private _consumeFrames(socket: Socket, peer: string, buffer: Buffer): Buffer {
        let rest = buffer;
        while (rest.length >= MBAP_HEADER_LENGTH) {
            const length = rest.readUInt16BE(4);
            if (length < 2 || length > MAX_MBAP_LENGTH) {
                this.logger.warn({ peer, length }, 'invalid MBAP frame, closing simulator connection');
                socket.destroy();
                return Buffer.alloc(0);
            }
            const frameLength = 6 + length;
            if (rest.length < frameLength) {
                break;
            }
            this._handleFrame(socket, rest.subarray(0, frameLength));
            rest = rest.subarray(frameLength);
        }
        return rest;
    }

    private _handleFrame(socket: Socket, frame: Buffer): void {
        const transactionId = frame.readUInt16BE(0);
        const protocolId = frame.readUInt16BE(2);
        const unitId = frame.readUInt8(6);
        const device = protocolId === 0 ? this.handlers.resolve(unitId) : undefined;
        if (!device) {
            return;
        }
        const result = this._execute(device, frame.subarray(MBAP_HEADER_LENGTH));
        socket.write(this._mbap(transactionId, unitId, result.response));
        if (result.write) {
            this._afterWrite(device, result.write);
        }
    }

    // Exécute la requête ; une erreur devient une réponse d'exception Modbus
    private _execute(device: SimulatedDevice, pdu: Buffer): PduResult {
        try {
            return this._handlePdu(device, pdu);
        } catch (err) {
            const isModbusException = err instanceof ModbusExceptionError;
            if (!isModbusException) {
                this.logger.error({ unitId: device.unitId, err: err instanceof Error ? err.message : String(err) }, 'simulated device failure');
            }
            const code = isModbusException ? err.code : ModbusExceptionCode.SLAVE_DEVICE_FAILURE;
            return { response: Buffer.from([pdu.readUInt8(0) | EXCEPTION_FLAG, code]) };
        }
    }

    // Réponse envoyée : réadressage éventuel puis notification
    private _afterWrite(device: SimulatedDevice, { pendingUnitId }: WriteResult): void {
        const isReaddressed = pendingUnitId !== undefined && pendingUnitId !== device.unitId;
        if (isReaddressed) {
            this.logger.log({ kind: device.kind, from: device.unitId, to: pendingUnitId }, 'simulated device readdressed');
            device.applyUnitId(pendingUnitId);
        }
        this.handlers.onWrite(device, isReaddressed);
    }

    private _handlePdu(device: SimulatedDevice, pdu: Buffer): PduResult {
        switch (pdu.readUInt8(0)) {
            case FunctionCode.READ_COILS:
                return { response: this._readBits(device, ModbusTable.COILS, pdu) };
            case FunctionCode.READ_DISCRETE_INPUTS:
                return { response: this._readBits(device, ModbusTable.DISCRETE_INPUTS, pdu) };
            case FunctionCode.READ_HOLDING_REGISTERS:
                return { response: this._readRegisters(device, ModbusTable.HOLDING, pdu) };
            case FunctionCode.READ_INPUT_REGISTERS:
                return { response: this._readRegisters(device, ModbusTable.INPUT, pdu) };
            case FunctionCode.WRITE_SINGLE_COIL:
                return this._writeSingle(device, ModbusTable.COILS, pdu);
            case FunctionCode.WRITE_SINGLE_REGISTER:
                return this._writeSingle(device, ModbusTable.HOLDING, pdu);
            case FunctionCode.WRITE_MULTIPLE_COILS:
                return this._writeMultipleCoils(device, pdu);
            case FunctionCode.WRITE_MULTIPLE_REGISTERS:
                return this._writeMultipleRegisters(device, pdu);
            default:
                throw new ModbusExceptionError(ModbusExceptionCode.ILLEGAL_FUNCTION);
        }
    }

    // FC05 / FC06 : réponse = écho de la requête
    private _writeSingle(device: SimulatedDevice, table: ModbusTable, pdu: Buffer): PduResult {
        this._assertLength(pdu, 5);
        const write = device.write(table, pdu.readUInt16BE(1), [pdu.readUInt16BE(3)]);
        return { response: Buffer.from(pdu.subarray(0, 5)), write };
    }

    private _readBits(device: SimulatedDevice, table: ModbusTable, pdu: Buffer): Buffer {
        const { address, quantity } = this._readRequest(pdu, MAX_READ_BITS);
        const bits = device.read(table, address, quantity);
        const bytes = Buffer.alloc(Math.ceil(quantity / 8));
        bits.forEach((bit, i) => {
            if (bit) {
                bytes[i >> 3] |= 1 << (i % 8);
            }
        });
        return Buffer.concat([Buffer.from([pdu.readUInt8(0), bytes.length]), bytes]);
    }

    private _readRegisters(device: SimulatedDevice, table: ModbusTable, pdu: Buffer): Buffer {
        const { address, quantity } = this._readRequest(pdu, MAX_READ_REGISTERS);
        const values = device.read(table, address, quantity);
        const data = Buffer.alloc(quantity * 2);
        values.forEach((value, i) => data.writeUInt16BE(value & 0xFFFF, i * 2));
        return Buffer.concat([Buffer.from([pdu.readUInt8(0), data.length]), data]);
    }

    // FC15 / FC16 : réponse = adresse + quantité
    private _writeMultipleCoils(device: SimulatedDevice, pdu: Buffer): PduResult {
        const { address, quantity } = this._writeRequest(pdu, MAX_WRITE_BITS, (count) => Math.ceil(count / 8));
        const bits = Array.from({ length: quantity }, (_, i) => (pdu.readUInt8(6 + (i >> 3)) >> (i % 8)) & 1);
        return { response: Buffer.from(pdu.subarray(0, 5)), write: device.write(ModbusTable.COILS, address, bits) };
    }

    private _writeMultipleRegisters(device: SimulatedDevice, pdu: Buffer): PduResult {
        const { address, quantity } = this._writeRequest(pdu, MAX_WRITE_REGISTERS, (count) => count * 2);
        const values = Array.from({ length: quantity }, (_, i) => pdu.readUInt16BE(6 + i * 2));
        return { response: Buffer.from(pdu.subarray(0, 5)), write: device.write(ModbusTable.HOLDING, address, values) };
    }

    private _writeRequest(pdu: Buffer, maxQuantity: number, byteCountOf: (quantity: number) => number): { address: number; quantity: number } {
        const { address, quantity } = this._readRequest(pdu, maxQuantity);
        this._assertLength(pdu, 6);
        const byteCount = pdu.readUInt8(5);
        if (byteCount !== byteCountOf(quantity) || pdu.length < 6 + byteCount) {
            throw new ModbusExceptionError(ModbusExceptionCode.ILLEGAL_DATA_VALUE);
        }
        return { address, quantity };
    }

    private _readRequest(pdu: Buffer, maxQuantity: number): { address: number; quantity: number } {
        this._assertLength(pdu, 5);
        const address = pdu.readUInt16BE(1);
        const quantity = pdu.readUInt16BE(3);
        this._assertQuantity(address, quantity, maxQuantity);
        return { address, quantity };
    }

    private _assertQuantity(address: number, quantity: number, maxQuantity: number): void {
        if (quantity < 1 || quantity > maxQuantity) {
            throw new ModbusExceptionError(ModbusExceptionCode.ILLEGAL_DATA_VALUE);
        }
        if (address + quantity > 0x10000) {
            throw new ModbusExceptionError(ModbusExceptionCode.ILLEGAL_DATA_ADDRESS);
        }
    }

    private _assertLength(pdu: Buffer, length: number): void {
        if (pdu.length < length) {
            throw new ModbusExceptionError(ModbusExceptionCode.ILLEGAL_DATA_VALUE);
        }
    }

    private _mbap(transactionId: number, unitId: number, pdu: Buffer): Buffer {
        const header = Buffer.alloc(MBAP_HEADER_LENGTH);
        header.writeUInt16BE(transactionId, 0);
        header.writeUInt16BE(0, 2);
        header.writeUInt16BE(pdu.length + 1, 4);
        header.writeUInt8(unitId, 6);
        return Buffer.concat([header, pdu]);
    }
}
