/* eslint-disable max-lines-per-function */
import { ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { CycleModel } from '@process/domain/models/cycle.model';
import { ModuleModel } from '@process/domain/models/module.model';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { StructureModel } from '@process/domain/models/structure.model';

export class StructureEntity {
    public configuration: string;

    public static mapToStructureModel(structureEntity: StructureEntity): StructureModel {
        const struct: StructureModel = new StructureModel();
        struct.cycles = [];
        struct.sequences = [];
        const data = JSON.parse(structureEntity.configuration) as StructureModel;

        // mapping
        // eslint-disable-next-line max-lines-per-function
        data.cycles.forEach((cycledData) => {
            const cycle = new CycleModel();
            cycle.id = cycledData.id;
            cycle.status = ExecutableStatus.STOPPED;

            cycledData.sequences.forEach(sequenceData => {
                const sequence = new SequenceModel();
                sequence.id = sequenceData.id;
                sequence.status = sequenceData.status;
                sequence.duration = sequenceData.duration;
                sequence.modules = [];
                sequenceData.modules.forEach(moduleData => {
                    const module = new ModuleModel();
                    module.status = moduleData.status;
                    module.portNum = moduleData.portNum;
                    module.direction = moduleData.direction;
                    module.edge = moduleData.edge;
                    //mod1.debounceTimeout: number = undefined;
                    //mod1.activeLow: boolean = false;
                    //mod1.reconfigureDirection: boolean = true;
                    module.configure();
                    sequence.modules.push(module)
                });
                cycle.sequences.push(sequence);
            });
            struct.cycles.push(cycle);
        });
        return struct;
    }

    public static mapToStructureEntity(structureModel: StructureModel): StructureEntity {
        const entity = new StructureEntity();
        entity.configuration = JSON.stringify(structureModel);
        return entity;
    }
}

