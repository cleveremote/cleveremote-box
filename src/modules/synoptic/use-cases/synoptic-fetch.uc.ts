import { SynopticModel } from '@synoptic/domain/models/synoptic.model';
import { SynopticService } from '@synoptic/domain/services/synoptic.service';

export class SynopticFetchUC {
    public constructor(private synopticService: SynopticService) { }

    public execute(id: string): Promise<SynopticModel> {
        return this.synopticService.get(id);
    }
}
