import { ComRequestType } from '../interfaces/com-request.interface';
import { SensorType } from '../interfaces/sensor.interface';

export enum ModbusFunctionName {
  READ_COILS = 'readCoils',
  READ_DISCRETE_INPUTS = 'readDiscreteInputs',
  READ_HOLDING_REGISTERS = 'readHoldingRegisters',
  READ_INPUT_REGISTERS = 'readInputRegisters',
  WRITE_SINGLE_COIL = 'writeCoil',
  WRITE_SINGLE_REGISTER = 'writeRegister',
  WRITE_MULTIPLE_COILS = 'writeCoils',
  WRITE_MULTIPLE_REGISTERS = 'writeRegisters',
}

// Copie locale des formes de retour de modbus-serial (ModbusRTU.d.ts) : ce sous-chemin
// n'est pas ré-exporté par l'index.d.ts du package et n'a pas de .js associé, donc pas
// d'import direct fiable.
export interface ModbusReadCoilResult {
    data: boolean[];
    buffer: Buffer;
}

export interface ModbusReadRegisterResult {
    data: number[];
    buffer: Buffer;
}

export interface ModbusWriteCoilResult {
    address: number;
    state: boolean;
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
}

export type ModbusExecuteResult<F extends ModbusFunctionName = ModbusFunctionName> = {
    [K in F]: { function: K; result: ModbusFunctionResultMap[K] }
}[F];

export class ComRequestConfigModel {
    public address: number;
    public function?: ModbusFunctionName[];
    public disabled?: boolean;
    public done?: boolean;
    public params: {
        length?: number,
        scale?: number,
        unit?: string,
        value?: number | number[],
        persistence?: {
            persist: boolean,
            address: number
        }
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
