import { ComRequestType } from '../interfaces/com-request.interface';
import { SensorType } from '../interfaces/sensor.interface';

export enum ModbusFunctionName {
  READ_COILS = 'readCoils', //01
  READ_DISCRETE_INPUTS = 'readDiscreteInputs', //02
  READ_HOLDING_REGISTERS = 'readHoldingRegisters', //03
  READ_INPUT_REGISTERS = 'readInputRegisters', //04
  WRITE_SINGLE_COIL = 'writeCoil', //05
  WRITE_SINGLE_REGISTER = 'writeRegister', //06
  WRITE_MULTIPLE_COILS = 'writeCoils',//15 (0F hex)
  WRITE_MULTIPLE_REGISTERS = 'writeRegisters',//16 (10 hex)
  CUSTOM_SINGLE_COIL = 'customCoil', //05 avec valeur 0x5500 (non standard, certaines cartes relais)
  CUSTOM_MULTIPLE_COILS = 'customCoils', //05 + 0x5500 répété sur chaque coil (pas d'équivalent FC15)
}

// Copie locale des formes de retour de modbus-serial (ModbusRTU.d.ts) : ce sous-chemin
// n'est pas ré-exporté par l'index.d.ts du package et n'a pas de .js associé, donc pas
// d'import direct fiable.
export interface ModbusReadCoilResult {
    data: boolean[];
    buffer: Buffer;
}

export interface ModbusEvaluatedReading {
    formula: string;
    scope: Record<string, number>;
    value: number;
}

export interface ModbusReadRegisterResult {
    data: number[];
    buffer: Buffer;
    /** Décodage type-aware (ModbusValueType) + formule mathjs, uniquement quand config.type est défini */
    evaluated?: ModbusEvaluatedReading;
}

export interface ModbusWriteCoilResult {
    address: number;
    state: boolean;
}

export interface ModbusCustomCoilResult {
     address: number;
}

export interface ModbusCustomMultipleResult {
    addresses: number[];
}

export interface ModbusWriteRegisterResult {
    address: number;
    value: number;
}

export interface ModbusWriteMultipleResult {
    address: number;
    length: number;
}

export interface ModbusFunctionResultMap {
    [ModbusFunctionName.READ_COILS]: ModbusReadCoilResult;
    [ModbusFunctionName.READ_DISCRETE_INPUTS]: ModbusReadCoilResult;
    [ModbusFunctionName.READ_HOLDING_REGISTERS]: ModbusReadRegisterResult;
    [ModbusFunctionName.READ_INPUT_REGISTERS]: ModbusReadRegisterResult;
    [ModbusFunctionName.WRITE_SINGLE_COIL]: ModbusWriteCoilResult;
    [ModbusFunctionName.WRITE_SINGLE_REGISTER]: ModbusWriteRegisterResult;
    [ModbusFunctionName.WRITE_MULTIPLE_COILS]: ModbusWriteMultipleResult;
    [ModbusFunctionName.WRITE_MULTIPLE_REGISTERS]: ModbusWriteMultipleResult;
    [ModbusFunctionName.CUSTOM_SINGLE_COIL]: ModbusCustomCoilResult;
    [ModbusFunctionName.CUSTOM_MULTIPLE_COILS]: ModbusCustomMultipleResult;
}

export type ModbusExecuteResult<F extends ModbusFunctionName = ModbusFunctionName> = {
    [K in F]: { function: K; result: ModbusFunctionResultMap[K] }
}[F];

export enum ModbusValueType {
    CUMULATIVE = 'cumulative',
    FLOAT = 'float',
    INT = 'int',
    UINT32 = 'uint32',
    FLOAT_6_BYTES = 'float-6Bytes'
}

export class ComRequestConfigModel {
    public address: number;
    public function?: ModbusFunctionName[];
    public disabled?: boolean;
    public done?: boolean;
    public type?: ModbusValueType;
    public params?: {
        length?: number;
        scale?: number;
        unit?: string;
        value?: number | number[];
        formula?: string | null;
        persistence?: {
            persist: boolean;
            address: number;
        };
    };
}

export class ComRequestModel {
    public _id: string;
    public deviceId: string;
    public name: string;
    public description?: string;
    public type: ComRequestType[];
    public config: ComRequestConfigModel;
    public createdAt?: Date;
    public updatedAt?: Date;
    public deletedAt?: Date | null = null;
}
