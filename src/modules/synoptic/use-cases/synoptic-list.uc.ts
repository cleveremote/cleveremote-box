import { SynopticSummaryModel } from '@synoptic/domain/models/synoptic.model';
import { SynopticService } from '@synoptic/domain/services/synoptic.service';

export class SynopticListUC {
    public constructor(private synopticService: SynopticService) { }

    public execute(): Promise<SynopticSummaryModel[]> {
        return this.synopticService.list();
    }
}
