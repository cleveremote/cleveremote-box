/* eslint-disable max-lines-per-function */
import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { Observable, Subject } from 'rxjs';
import { ActuatorRepository } from '@process/infrastructure/repositories/actuator.repository';
import { CycleRepository } from '@process/infrastructure/repositories/cycle.repository';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { SequenceRepository } from '@process/infrastructure/repositories/sequence.repository';
import { SensorRepository } from '@process/infrastructure/repositories/sensor.repository';
import { InverterRepository } from '@process/infrastructure/repositories/inverter.repository';
import { ActuatorModel } from '@process/domain/models/actuator.model';
import { CycleModel } from '@process/domain/models/cycle.model';
import { DeviceModel } from '@process/domain/models/device.model';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { SensorModel } from '@process/domain/models/sensor.model';
import { InverterModel } from '@process/domain/models/inverter.model';
import { AutoCreatedElements, SlaveBundle } from './auto-creation-strategy.interface';

@Injectable()
export class SlaveBundlePersister {
    private readonly _sensorsCreated = new Subject<SensorModel[]>();

    // sensors d'un slave persisté avec succès (scan ou rattrapage) : SensorService démarre leur lecture périodique
    public readonly sensorsCreated$: Observable<SensorModel[]> = this._sensorsCreated.asObservable();

    public constructor(
        private deviceRepository: DeviceRepository,
        private actuatorRepository: ActuatorRepository,
        private cycleRepository: CycleRepository,
        private sequenceRepository: SequenceRepository,
        private sensorRepository: SensorRepository,
        private inverterRepository: InverterRepository,
        private readonly logger: Logger
    ) { }

    // Pas de transaction (Mongo standalone) : si une écriture échoue, ce qui a déjà été créé est supprimé (compensation)
    public async save(built: SlaveBundle): Promise<SlaveBundle> {
        const device = await this.deviceRepository.save(built.device);
        return this._saveElements(device, built, true);
    }

    // Éléments rattachés à un slave déjà persisté (rattrapage) : en cas d'échec, seuls les éléments créés ici sont supprimés
    public async saveElements(device: DeviceModel, elements: AutoCreatedElements): Promise<SlaveBundle> {
        return this._saveElements(device, elements, false);
    }

    private async _saveElements(device: DeviceModel, built: AutoCreatedElements, isDeviceCreated: boolean): Promise<SlaveBundle> {
        const actuatorResults = await Promise.allSettled(built.actuators.map((actuator) => this.actuatorRepository.save(actuator)));
        const actuatorFailure = this._firstFailure(actuatorResults);
        if (actuatorFailure) {
            await this._rollbackSlave(device, isDeviceCreated, actuatorResults);
            throw actuatorFailure.reason;
        }
        const sensorResults = await Promise.allSettled(built.sensors.map((sensor) => this.sensorRepository.save(sensor)));
        const sensorFailure = this._firstFailure(sensorResults);
        if (sensorFailure) {
            await this._rollbackSlave(device, isDeviceCreated, actuatorResults, sensorResults);
            throw sensorFailure.reason;
        }
        // après les sensors : l'élément variateur référence son sensor de détection du manuel
        const inverterResults = await Promise.allSettled((built.inverters ?? []).map((inverter) => this.inverterRepository.save(inverter)));
        const inverterFailure = this._firstFailure(inverterResults);
        if (inverterFailure) {
            await this._rollbackSlave(device, isDeviceCreated, actuatorResults, sensorResults, [], inverterResults);
            throw inverterFailure.reason;
        }
        const cycleResults = await Promise.allSettled(built.cycles.map((cycle) => this.cycleRepository.save(cycle)));
        const sequenceResults = this._firstFailure(cycleResults)
            ? []
            : await Promise.allSettled(built.cycles.flatMap((cycle) => cycle.sequences.map((sequence) => this.sequenceRepository.save(sequence))));
        const failure = this._firstFailure(cycleResults) ?? this._firstFailure(sequenceResults);
        if (failure) {
            await this._rollbackSlave(device, isDeviceCreated, actuatorResults, sensorResults, cycleResults, inverterResults);
            throw failure.reason;
        }
        const sequences = sequenceResults.map((r) => (r as PromiseFulfilledResult<SequenceModel>).value);
        const sensors = sensorResults.map((r) => (r as PromiseFulfilledResult<SensorModel>).value);
        if (sensors.length) {
            this._sensorsCreated.next(sensors);
        }
        return {
            device,
            actuators: actuatorResults.map((r) => (r as PromiseFulfilledResult<ActuatorModel>).value),
            sensors,
            inverters: inverterResults.map((r) => (r as PromiseFulfilledResult<InverterModel>).value),
            cycles: cycleResults.map((r) => {
                const cycle = (r as PromiseFulfilledResult<CycleModel>).value;
                cycle.sequences = sequences.filter((sequence) => sequence.cycleId === cycle._id);
                return cycle;
            })
        };
    }

    private _firstFailure(results: PromiseSettledResult<unknown>[]): PromiseRejectedResult | undefined {
        return results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    }

    // la suppression d'un cycle supprime aussi ses séquences (CycleRepository.delete)
    // isDeviceCreated : le device a été créé par cette sauvegarde (supprimé avec ses éléments)
    private async _rollbackSlave(device: DeviceModel, isDeviceCreated: boolean, actuatorResults: PromiseSettledResult<ActuatorModel>[],
        sensorResults: PromiseSettledResult<SensorModel>[] = [], cycleResults: PromiseSettledResult<CycleModel>[] = [],
        inverterResults: PromiseSettledResult<InverterModel>[] = []): Promise<void> {
        const savedIds = <T extends { _id: string }>(results: PromiseSettledResult<T>[]): string[] =>
            results.filter((r): r is PromiseFulfilledResult<T> => r.status === 'fulfilled').map((r) => r.value._id);
        const rollbacks = await Promise.allSettled([
            ...savedIds(cycleResults).map((id) => this.cycleRepository.delete(id)),
            ...savedIds(inverterResults).map((id) => this.inverterRepository.delete(id)),
            ...savedIds(sensorResults).map((id) => this.sensorRepository.delete(id)),
            ...savedIds(actuatorResults).map((id) => this.actuatorRepository.delete(id)),
            ...(isDeviceCreated ? [this.deviceRepository.delete(device._id)] : [])
        ]);
        const failed = rollbacks.filter((r) => r.status === 'rejected').length;
        if (failed) {
            this.logger.error({ deviceId: device._id, failed }, 'slave rollback incomplete, orphan documents left');
        }
    }
}
