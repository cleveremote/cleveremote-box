import { Injectable, Logger } from '@nestjs/common';
import { ConfigurationService } from './configuration.service';
import { BehaviorSubject } from 'rxjs';
import { ISensorValue } from '../interfaces/structure-repository.interface';
import { ReadableType } from '../interfaces/executable.interface';

@Injectable()
export class SensorService {
    public intervals = []
    public constructor(
        private configurationService: ConfigurationService
    ) { }



    public initialize(): Promise<void> {
        this.configurationService.structure?.sensors?.forEach(sensor => {
            this.configurationService.deviceListeners.push({ subject: new BehaviorSubject<ISensorValue>(null), deviceId: sensor.id });
            const nIntervId = setInterval(() => {
                const value = Math.floor(Math.random() * (100 - 0 + 1) + 0)
                this.emitReceivedData({ id: sensor.id, value, type: ReadableType.SENSOR });
            }, 10000);
            this.intervals.push(nIntervId);

        });
        return;
    }

    public emitReceivedData(data: ISensorValue): void {
        const st = this.configurationService.deviceListeners.find(x => x.deviceId === data.id);
        if (st) {
            st.subject.next(data);
        }

    }

    public clearAllIntervals(): void {
        this.intervals.forEach(nIntervId => {
            clearInterval(nIntervId);
        });

    }
}