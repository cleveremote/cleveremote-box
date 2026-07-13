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

export class ComRequestModel {
    public _id: string;
    public deviceId: string;
    public name: string;
    public type: ComRequestType;
    public config: {
        address: number;
        function: ModbusFunctionName;
        params: {
            length?: number,
            scale?: number,
            unit?: string,
            value?: number
        }
    };
    public createdAt?: Date;
    public updatedAt?: Date;
    public deletedAt?: Date | null = null;
}
