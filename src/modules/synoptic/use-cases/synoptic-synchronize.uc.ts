import { SynopticModel, SynopticSynchronizeModel } from '@synoptic/domain/models/synoptic.model';
import { SynopticService } from '@synoptic/domain/services/synoptic.service';

export class SynopticSynchronizeUC {
    public constructor(private synopticService: SynopticService) { }

    public execute(input: SynopticSynchronizeModel): Promise<SynopticModel> {
        return this.synopticService.synchronize(input);
    }
}
