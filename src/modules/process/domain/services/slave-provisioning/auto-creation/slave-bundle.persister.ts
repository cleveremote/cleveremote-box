/* eslint-disable max-lines-per-function */
import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { ActuatorRepository } from '@process/infrastructure/repositories/actuator.repository';
import { CycleRepository } from '@process/infrastructure/repositories/cycle.repository';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { SequenceRepository } from '@process/infrastructure/repositories/sequence.repository';
import { ActuatorModel } from '@process/domain/models/actuator.model';
import { CycleModel } from '@process/domain/models/cycle.model';
import { DeviceModel } from '@process/domain/models/device.model';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { SlaveBundle } from './auto-creation-strategy.interface';

@Injectable()
export class SlaveBundlePersister {
    public constructor(
        private deviceRepository: DeviceRepository,
        private actuatorRepository: ActuatorRepository,
        private cycleRepository: CycleRepository,
        private sequenceRepository: SequenceRepository,
        private readonly logger: Logger
    ) { }

    // Pas de transaction (Mongo standalone) : si une écriture échoue, ce qui a déjà été créé est supprimé (compensation)
    public async save(built: SlaveBundle): Promise<SlaveBundle> {
        const device = await this.deviceRepository.save(built.device);
        const actuatorResults = await Promise.allSettled(built.actuators.map((actuator) => this.actuatorRepository.save(actuator)));
        const actuatorFailure = this._firstFailure(actuatorResults);
        if (actuatorFailure) {
            await this._rollbackSlave(device, actuatorResults);
            throw actuatorFailure.reason;
        }
        const cycleResults = await Promise.allSettled(built.cycles.map((cycle) => this.cycleRepository.save(cycle)));
        const sequenceResults = this._firstFailure(cycleResults)
            ? []
            : await Promise.allSettled(built.cycles.flatMap((cycle) => cycle.sequences.map((sequence) => this.sequenceRepository.save(sequence))));
        const failure = this._firstFailure(cycleResults) ?? this._firstFailure(sequenceResults);
        if (failure) {
            await this._rollbackSlave(device, actuatorResults, cycleResults);
            throw failure.reason;
        }
        const sequences = sequenceResults.map((r) => (r as PromiseFulfilledResult<SequenceModel>).value);
        return {
            device,
            actuators: actuatorResults.map((r) => (r as PromiseFulfilledResult<ActuatorModel>).value),
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
    private async _rollbackSlave(device: DeviceModel, actuatorResults: PromiseSettledResult<ActuatorModel>[],
        cycleResults: PromiseSettledResult<CycleModel>[] = []): Promise<void> {
        const savedIds = <T extends { _id: string }>(results: PromiseSettledResult<T>[]): string[] =>
            results.filter((r): r is PromiseFulfilledResult<T> => r.status === 'fulfilled').map((r) => r.value._id);
        const rollbacks = await Promise.allSettled([
            ...savedIds(cycleResults).map((id) => this.cycleRepository.delete(id)),
            ...savedIds(actuatorResults).map((id) => this.actuatorRepository.delete(id)),
            this.deviceRepository.delete(device._id)
        ]);
        const failed = rollbacks.filter((r) => r.status === 'rejected').length;
        if (failed) {
            this.logger.error({ deviceId: device._id, failed }, 'slave rollback incomplete, orphan documents left');
        }
    }
}
