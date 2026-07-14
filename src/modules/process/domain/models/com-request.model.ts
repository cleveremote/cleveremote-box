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

export class ComRequestConfigModel {
    public address: number;
    public function?: ModbusFunctionName[];
    public disabled?: boolean;
    public params: {
        length?: number,
        scale?: number,
        unit?: string,
        value?: number,
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
