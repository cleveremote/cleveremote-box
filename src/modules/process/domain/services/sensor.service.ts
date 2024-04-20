import { Injectable } from '@nestjs/common';
import { StructureService } from './configuration.service';
import { BehaviorSubject } from 'rxjs';
import { SynchronizeService } from './synchronize.service';
import { SensorValueModel } from '../models/sensor-value.model';
import { TriggerService } from './trigger.service';

@Injectable()
export class SensorService {
    //sensors can be added automatically only. device id is serial number on sensor box app.
    public intervals = []
    public constructor(
        private configurationService: StructureService,
        private synchronizeService: SynchronizeService,
        private triggerService: TriggerService
    ) { }



    public initialize(): Promise<void> {
        // serial listener 
        // all the value can come from the sensor box prog
        // const newSensor = new SensorModel();
        // newSensor.id = 'SENSOR_123';
        // newSensor.name = 'SENSOR_123';
        // newSensor.description = 'SENSOR_123';
        // newSensor.type = SensorType.MOISTURE;
        // newSensor.unit = 'sensor_unit';
        // this.synchronizeService.sychronizeSensor(newSensor);

        this.configurationService.structure?.sensors?.forEach(sensor => {
            this.configurationService.deviceListeners.push({ subject: new BehaviorSubject<SensorValueModel>(null), deviceId: sensor.id });
            const nIntervId = setInterval(() => {
                const value = Math.floor(Math.random() * (100 - 0 + 1) + 0)
                this.emitReceivedData({ id: sensor.id, value, type: 'SENSOR' });
            }, 20000);
            this.intervals.push(nIntervId);

        });
        return;
    }
    //function used to emit value when intercepts sensor values. 
    public emitReceivedData(data: SensorValueModel): void {
        // const st = this.configurationService.deviceListeners.find(x => x.deviceId === data.id);
        // if (st) {
        //     st.subject.next(data);
        // }
        this.triggerService.onElementValueChanged.next(data)
    }

    public clearAllIntervals(): void {
        this.intervals.forEach(nIntervId => {
            clearInterval(nIntervId);
        });
    }
}