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
import { DataModel } from '@process/domain/models/data.model';
import { DataRepository } from './data.repository';

@Injectable()
export class ValueRepository {

    public constructor(
        private dbService: DbService,
        private sensorValueRepository: SensorValueRepository,
        private processValueRepository: ProcessValueRepository,
        private dataRepository: DataRepository
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

    public async getData(query: any): Promise<DataModel[]> {

        const startDate = new Date(query.startDate);
        const endDate = new Date(query.endDate);

        const startMonthIndex = startDate.getMonth();
        const startYearhIndex = startDate.getFullYear();
        const endMonthIndexDb = endDate.getMonth();
        const endYearhIndex = endDate.getFullYear();
        const keys = []

        for (let index = startYearhIndex; index <= endYearhIndex; index++) {
            if (index === startYearhIndex) {
                for (let indexM = startMonthIndex; indexM <= endMonthIndexDb; indexM++) {
                    keys.push(`${indexM}-${startYearhIndex}`);
                }
            } else {
                for (let indexM = 1; indexM <= 12; indexM++) {
                    keys.push(`${indexM}-${startYearhIndex}`);
                }
            }
        }
        let resultArray = [];

        for (let index = 0; index < keys.length; index++) {
            const key = keys[index];
            resultArray = resultArray.concat(await this.dataRepository.get(key) as DataModel[]);
        }

        resultArray = resultArray.filter(x => x.deviceId === query.deviceId)

        const indexStartDate = resultArray.findIndex(x => x.date.getTime() >= startDate.getTime());
        const indexEndtDate = resultArray.findIndex(x => x.date.getTime() >= endDate.getTime());

        return resultArray.slice(indexStartDate === -1 ? 0 : indexStartDate, indexEndtDate === -1 ? resultArray.length : indexEndtDate);
    }

    public getLastValue(deviceId: string): Promise<DataModel> {
        return this.dataRepository.getLast(deviceId);
    }

    public async getDeviceValue(deviceId: string): Promise<SensorValueModel | ProcessValueModel> {
        const values = (await this.getValues()) as ValueEntity;
        return values.processes.find(x => x.id === deviceId) || values.sensors.find(x => x.id === deviceId);
    }

}