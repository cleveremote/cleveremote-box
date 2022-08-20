import { CronSync, CycleSynchronizeDTO, ScheduleSynchronizeDTO, SequenceSync } from '@process/infrastructure/dto/synchronize.dto';

// eslint-disable-next-line max-lines-per-function
export function CreateSynchronizePartialDto(): CycleSynchronizeDTO {

    const irrigationSecteur1: SequenceSync = new SequenceSync();

    irrigationSecteur1.id = 'partial11';
    irrigationSecteur1.name = 'irrigationSecteur1';
    irrigationSecteur1.description = 'description irrigationSecteur1';
    irrigationSecteur1.maxDuration = 10000; //3 secondes
    irrigationSecteur1.modules = ['16', '26'];

    const cycleSynchronizeDTO: CycleSynchronizeDTO = new CycleSynchronizeDTO();
    cycleSynchronizeDTO.id = 'partial1';
    cycleSynchronizeDTO.name = 'irragation secteur 1';
    cycleSynchronizeDTO.description = 'descritption irragation secteur 1';
    cycleSynchronizeDTO.style = { bgColor: 'bgColor', fontColor: 'fontColor', iconColor: 'iconColor' };
    cycleSynchronizeDTO.sequences = [irrigationSecteur1];

    return cycleSynchronizeDTO;
}

export function CreateSynchronizePartialUpdateDto(): CycleSynchronizeDTO {

    const irrigationSecteur1: SequenceSync = new SequenceSync();

    irrigationSecteur1.id = '11';
    irrigationSecteur1.name = 'irrigationSecteur1';
    irrigationSecteur1.description = 'description irrigationSecteur1';
    irrigationSecteur1.maxDuration = 10000; //3 secondes
    irrigationSecteur1.modules = ['16', '26'];

    const cycleSynchronizeDTO: CycleSynchronizeDTO = new CycleSynchronizeDTO();
    cycleSynchronizeDTO.id = '1';
    cycleSynchronizeDTO.name = 'irragation secteur 1';
    cycleSynchronizeDTO.description = 'descritption irragation secteur 1';
    cycleSynchronizeDTO.style = { bgColor: 'bgColor', fontColor: 'fontColor', iconColor: 'iconColor' };
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
    irrigationSecteur1.maxDuration = 10000; //3 secondes
    irrigationSecteur1.modules = ['16', 'deleted_26'];

    const irrigationSecteur2: SequenceSync = new SequenceSync();
    irrigationSecteur2.id = 'deleted_12';

    const cycleSynchronizeDTO: CycleSynchronizeDTO = new CycleSynchronizeDTO();
    cycleSynchronizeDTO.id = '1';
    cycleSynchronizeDTO.name = 'irragation secteur 1';
    cycleSynchronizeDTO.description = 'descritption irragation secteur 1';
    cycleSynchronizeDTO.style = { bgColor: 'bgColor', fontColor: 'fontColor', iconColor: 'iconColor' };
    cycleSynchronizeDTO.sequences = [irrigationSecteur1, irrigationSecteur2];

    return cycleSynchronizeDTO;
}

export function CreateNewScheduleDto(update: boolean = false): ScheduleSynchronizeDTO {

    const scheduleSynchronizeDTO: ScheduleSynchronizeDTO = new ScheduleSynchronizeDTO();
    scheduleSynchronizeDTO.id = 'schedule1';
    scheduleSynchronizeDTO.cycleId = '1';
    scheduleSynchronizeDTO.name = update ? 'name-schedule1122_updated' : 'name-schedule1';
    scheduleSynchronizeDTO.description = 'descritption schedule1';
    scheduleSynchronizeDTO.cron = new CronSync();
    const dateNow = new Date();
    dateNow.setMilliseconds(dateNow.getMilliseconds() + (update ? 5000 : 2000))
    scheduleSynchronizeDTO.cron.date = dateNow;
    scheduleSynchronizeDTO.cron.pattern = null;
    //{ date: (new Date()).setSeconds(2), pattern:'2 * * * * * * *' };

    return scheduleSynchronizeDTO;
}

export function CreateNewScheduleDtowithPattern(): ScheduleSynchronizeDTO {

    const scheduleSynchronizeDTO: ScheduleSynchronizeDTO = new ScheduleSynchronizeDTO();
    scheduleSynchronizeDTO.id = 'schedule1';
    scheduleSynchronizeDTO.cycleId = '1';
    scheduleSynchronizeDTO.name = 'name-schedule1';
    scheduleSynchronizeDTO.description = 'descritption schedule1';
    scheduleSynchronizeDTO.cron = new CronSync();
    scheduleSynchronizeDTO.cron.pattern = '2 * * * * *';

    return scheduleSynchronizeDTO;
}


export function CreateScheduleDeleteDto(): ScheduleSynchronizeDTO {

    const scheduleSynchronizeDTO: ScheduleSynchronizeDTO = new ScheduleSynchronizeDTO();
    scheduleSynchronizeDTO.id = 'deleted_schedule1';
    scheduleSynchronizeDTO.cycleId = '1';


    return scheduleSynchronizeDTO;
}


