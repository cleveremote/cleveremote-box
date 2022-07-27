/* eslint-disable max-lines-per-function */
/* eslint-disable no-empty */
import { Injectable } from '@nestjs/common';
import { ConfigurationRepository } from '@process/infrastructure/repositories/configuration.repository';
import { ExecutableStatus } from '../interfaces/executable.interface';
import { GPIODirection, GPIOEdge, ModuleStatus } from '../interfaces/structure.interface';
import { CycleModel } from '../models/cycle.model';
import { ModuleModel } from '../models/module.model';
import { SequenceModel } from '../models/sequence.model';
import { StructureModel } from '../models/structure.model';
import { SynchronizeCycleModel, SynchronizeModuleModel, SynchronizeSequenceModel } from '../models/synchronize.model';
import { ConfigurationService } from './configuration.service';

@Injectable()
export class SynchronizeService {
    public constructor(private structureRepository: ConfigurationRepository,
        private configurationService: ConfigurationService) {
    }

    public async synchronize(configuration: StructureModel): Promise<StructureModel> {
        return this.structureRepository.saveStructure(configuration).then((data) => {
            this.configurationService.structure = data;

            const cycles = this.configurationService.structure.cycles;

            let sequences: SequenceModel[] = [];
            cycles.forEach((cycle) => {
                sequences = sequences.concat(cycle.sequences);
                sequences = [...new Set([...sequences, ...cycle.sequences])];
            });
            this.configurationService.sequences = sequences;

            return data;
        });
    }

    public async sychronizePartial(cycleData: SynchronizeCycleModel): Promise<CycleModel> {
        this._syncCycle(this.configurationService.structure, cycleData);
        await this.synchronize(this.configurationService.structure);
        return this.configurationService.structure.cycles.find(x => x.id === cycleData.id);
    }

    private _syncCycle(structure: StructureModel, data: SynchronizeCycleModel): void {
        const cycleToUpdate = structure.cycles.find((cycle) => cycle.id === data.id);
        if (cycleToUpdate && data.shouldDelete) {
            const index = structure.cycles.findIndex(cy => cy.id === data.id);
            structure.cycles.splice(index, 1);
        } else if (cycleToUpdate) {
            cycleToUpdate.id = data.id;
            cycleToUpdate.name = data.name;
            cycleToUpdate.style = data.style;
            cycleToUpdate.description = data.description;
            data.sequences.forEach((seqData) => {
                this._syncSequence(cycleToUpdate, seqData);
            })
        } else {
            const newCycle = new CycleModel();
            newCycle.id = data.id;
            newCycle.name = data.name;
            newCycle.style = data.style;
            newCycle.description = data.description;
            newCycle.maxDuration = data.maxDuration;
            data.sequences.forEach((seqData) => {
                this._syncSequence(newCycle, seqData);
            })
        }
    }

    private _syncSequence(cycleToUpdate: CycleModel, data: SynchronizeSequenceModel): void {
        const sequenceToUpdate = cycleToUpdate.sequences.find(seq => seq.id === data.id);
        if (sequenceToUpdate && data.shouldDelete) {
            const index = cycleToUpdate.sequences.findIndex(cy => cy.id === data.id);
            cycleToUpdate.sequences.splice(index, 1);
            return;
        } else if (sequenceToUpdate) {
            sequenceToUpdate.name = data.name;
            sequenceToUpdate.description = data.description;
            sequenceToUpdate.duration = data.duration;

            data.modules.forEach((modData) => {
                this._syncModule(sequenceToUpdate, modData);
            });
            return;
        }
        const newSequence = new SequenceModel();
        newSequence.id = data.id;
        newSequence.name = data.name;
        newSequence.description = data.description;
        newSequence.duration = data.duration;
        newSequence.status = ExecutableStatus.STOPPED;
        newSequence.progression = null;
        data.modules.forEach((modData) => {
            this._syncModule(newSequence, modData);
        });
        cycleToUpdate.sequences.push(newSequence);
    }

    private _syncModule(sequenceToUpdate: SequenceModel, data: SynchronizeModuleModel): void {
        const moduleToUpdate = sequenceToUpdate.modules.find(mod => mod.portNum === data.portNum);
        if (moduleToUpdate && data.shouldDelete) {
            const index = sequenceToUpdate.modules.findIndex(cy => cy.portNum === data.portNum);
            sequenceToUpdate.modules.splice(index, 1);
            return;
        } else if (moduleToUpdate) {
            // moduleToUpdate.id = data.id;
            // moduleToUpdate.name = data.name;
            // moduleToUpdate.description = data.description;
            // moduleToUpdate.duration = data.duratio
            return;
        }
        const newModule = new ModuleModel();
        newModule.status = ModuleStatus.OFF;
        newModule.portNum = data.portNum;
        newModule.direction = GPIODirection.OUT;
        newModule.edge = GPIOEdge.BOTH;
        newModule.configure();
        sequenceToUpdate.modules.push(newModule);
    }

}
