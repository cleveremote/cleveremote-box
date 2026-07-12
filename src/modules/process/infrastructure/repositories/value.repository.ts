import { Injectable } from '@nestjs/common';
import { SensorValueModel } from '@process/domain/models/sensor-value.model';
import { ProcessValueModel } from '@process/domain/models/proccess-value.model';
import { EventModel } from '@process/domain/models/event.model';
import { SensorModel } from '@process/domain/models/sensor.model';
import { CycleModel } from '@process/domain/models/cycle.model';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { EventRepository } from './event.repository';
import { StructureService } from '@process/domain/services/configuration.service';

@Injectable()
export class ValueRepository {

    public constructor(
        private eventRepository: EventRepository,
        private structureService: StructureService
    ) { }

    public async getEvents(query: { deviceId: string; startDate: string; endDate: string }): Promise<EventModel[]> {
        const startDate = new Date(query.startDate);
        const endDate = new Date(query.endDate);
        return this.eventRepository.getByDeviceAndDateRange(query.deviceId, startDate, endDate);
    }

    public getLastValue(deviceId: string): Promise<EventModel> {
        return this.eventRepository.getLast(deviceId);
    }

    // lecture en memoire : les cycles/sequences portent leur status a jour sur eux-memes
    // (execution.service.ts._processProgress), et les capteurs leur derniere lecture connue
    // (sensor.service.ts.emitReceivedData) ; plus besoin d'un store JSON separe pour ca.
    public async getDeviceValue(deviceId: string): Promise<SensorValueModel | ProcessValueModel> {
        const structure = this.structureService.structure;
        const executable = [...structure.cycles, ...structure.getSequences()].find((x) => x._id === deviceId);
        if (executable) {
            return this._toProcessValue(executable);
        }
        return this._toSensorValue(structure.sensors.find((x) => x.id === deviceId));
    }

    private _toProcessValue(executable: CycleModel | SequenceModel): ProcessValueModel {
        const value = new ProcessValueModel();
        value.id = executable._id;
        value.status = executable.status;
        return value;
    }

    private _toSensorValue(sensor?: SensorModel): SensorValueModel | undefined {
        if (!sensor || sensor.value === undefined) {
            return undefined;
        }
        const value = new SensorValueModel();
        value.id = sensor.id;
        value.value = sensor.value;
        value.date = sensor.date;
        return value;
    }

}
