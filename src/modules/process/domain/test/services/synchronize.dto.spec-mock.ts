import { ConditionType, ExecutableAction, ExecutableMode, ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { GPIODirection, GPIOEdge, ModuleStatus } from '@process/domain/interfaces/structure.interface';
import { CycleModel } from '@process/domain/models/cycle.model';
import { ProcessModel } from '@process/domain/models/process.model';
import { ModuleModel } from '@process/domain/models/module.model';
import { SequenceModel } from '@process/domain/models/sequence.model';
import { CycleSynchronizeDTO, SequenceSync } from '@process/infrastructure/dto/synchronize.dto';

// eslint-disable-next-line max-lines-per-function
export function CreateSynchronizePartialDto(): CycleSynchronizeDTO {

    const irrigationSecteur1: SequenceSync = new SequenceSync();

    irrigationSecteur1.id = 'partial11';
    irrigationSecteur1.name = 'irrigationSecteur1';
    irrigationSecteur1.description = 'description irrigationSecteur1';
    irrigationSecteur1.duration = 10000; //3 secondes
    irrigationSecteur1.modules = ['16', '26'];

    const cycleSynchronizeDTO: CycleSynchronizeDTO = new CycleSynchronizeDTO();
    cycleSynchronizeDTO.id = 'partial1';
    cycleSynchronizeDTO.name = 'irragation secteur 1';
    cycleSynchronizeDTO.description = 'descritption irragation secteur 1';
    cycleSynchronizeDTO.style = { bgColor: 'bgColor', fontColor: 'fontColor', iconColor: 'iconColor' };
    cycleSynchronizeDTO.maxDuration = 10000;
    cycleSynchronizeDTO.sequences = [irrigationSecteur1];

    return cycleSynchronizeDTO;
}

export function CreateSynchronizePartialUpdateDto(): CycleSynchronizeDTO {

    const irrigationSecteur1: SequenceSync = new SequenceSync();

    irrigationSecteur1.id = '11';
    irrigationSecteur1.name = 'irrigationSecteur1';
    irrigationSecteur1.description = 'description irrigationSecteur1';
    irrigationSecteur1.duration = 10000; //3 secondes
    irrigationSecteur1.modules = ['16', '26'];

    const cycleSynchronizeDTO: CycleSynchronizeDTO = new CycleSynchronizeDTO();
    cycleSynchronizeDTO.id = '1';
    cycleSynchronizeDTO.name = 'irragation secteur 1';
    cycleSynchronizeDTO.description = 'descritption irragation secteur 1';
    cycleSynchronizeDTO.style = { bgColor: 'bgColor', fontColor: 'fontColor', iconColor: 'iconColor' };
    cycleSynchronizeDTO.maxDuration = 10000;
    cycleSynchronizeDTO.sequences = [irrigationSecteur1];

    return cycleSynchronizeDTO;
}

export function CreateSynchronizePartialDeleteDto(): CycleSynchronizeDTO {

    const cycleSynchronizeDTO: CycleSynchronizeDTO = new CycleSynchronizeDTO();
    cycleSynchronizeDTO.id = 'deleted_1';


    return cycleSynchronizeDTO;
}

export function CreateDelSeqAndDelModuleDto(): CycleSynchronizeDTO {

    const irrigationSecteur1: SequenceSync = new SequenceSync();

    irrigationSecteur1.id = '11';
    irrigationSecteur1.name = 'irrigationSecteur1';
    irrigationSecteur1.description = 'description irrigationSecteur1';
    irrigationSecteur1.duration = 10000; //3 secondes
    irrigationSecteur1.modules = ['16', 'deleted_26'];

    const irrigationSecteur2: SequenceSync = new SequenceSync();
    irrigationSecteur2.id = 'deleted_12';

    const cycleSynchronizeDTO: CycleSynchronizeDTO = new CycleSynchronizeDTO();
    cycleSynchronizeDTO.id = '1';
    cycleSynchronizeDTO.name = 'irragation secteur 1';
    cycleSynchronizeDTO.description = 'descritption irragation secteur 1';
    cycleSynchronizeDTO.style = { bgColor: 'bgColor', fontColor: 'fontColor', iconColor: 'iconColor' };
    cycleSynchronizeDTO.maxDuration = 10000;
    cycleSynchronizeDTO.sequences = [irrigationSecteur1, irrigationSecteur2];

    return cycleSynchronizeDTO;
}


