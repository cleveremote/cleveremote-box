import { SynopticDeleteResultModel } from '@synoptic/domain/models/synoptic.model';
import { SynopticService } from '@synoptic/domain/services/synoptic.service';

export class SynopticDeleteUC {
    public constructor(private synopticService: SynopticService) { }

    public execute(id: string): Promise<SynopticDeleteResultModel> {
        return this.synopticService.delete(id);
    }
}
