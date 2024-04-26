/* eslint-disable max-lines-per-function */
import {
    IRepository
} from '@process/domain/interfaces/structure-repository.interface';
import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { CycleEntity } from '../entities/cycle.entity';
import { ElementNotFoundExeception } from '@process/domain/errors/db-errors';
import { CycleModel } from '@process/domain/models/cycle.model';
import { ValueEntity } from '../entities/value.entity';
import { ProcessValueEntity } from '../entities/process-value.entity';
import { SensorValueEntity } from '../entities/sensor-value.entity';
import { SensorValueRepository } from './sensor-value.repository';
import { ProcessValueRepository } from './process-value.repository';
import { SensorValueModel } from '@process/domain/models/sensor-value.model';
import { ProcessValueModel } from '@process/domain/models/proccess-value.model';

@Injectable()
export class ValueRepository {

    public constructor(
        private dbService: DbService,
        private sensorValueRepository: SensorValueRepository,
        private processValueRepository: ProcessValueRepository
    ) { }

    // eslint-disable-next-line max-len
    public async getValues(type: string = '/', id?: string): Promise<ProcessValueEntity[] | SensorValueEntity[] | ValueEntity> {
        let result: ProcessValueEntity[] | SensorValueEntity[] | ValueEntity;
        let res;
        switch (type) {
            case 'SENSOR':
                res = await this.sensorValueRepository.get(id);
                if (Array.isArray(res)) {
                    result = res.filter(x => x.type === 'SEQUENCE');
                } else {
                    result = [res]
                }
                break;
            case 'SEQUENCE':
                res = await this.processValueRepository.get(id);
                if (Array.isArray(res)) {
                    result = res.filter(x => x.type === 'SEQUENCE');
                } else {
                    result = [res]
                }
                break;
            case 'CYCLE':
                res = await this.processValueRepository.get(id);
                if (Array.isArray(res)) {
                    result = res.filter(x => x.type === 'CYCLE');
                } else {
                    result = [res]
                }
                break;
            default:
                result = await this.dbService.DB_VALUES.getObject<ValueEntity>('/');
                break;
        }

        return result;
    }

    public async getDeviceValue(deviceId: string): Promise<SensorValueModel | ProcessValueModel> {
        const values = (await this.getValues()) as ValueEntity;
        return values.processes.find(x => x.id === deviceId) || values.sensors.find(x => x.id === deviceId);
    }

}