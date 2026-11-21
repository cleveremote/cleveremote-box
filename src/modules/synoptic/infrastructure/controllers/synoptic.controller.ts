import { Controller, UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { RpcErrorsFilter, RpcValidationExceptionFactory } from '@framework/errors/rpc-errors';
import { SynopticDeleteResultModel, SynopticModel, SynopticSummaryModel } from '@synoptic/domain/models/synoptic.model';
import { SynopticService } from '@synoptic/domain/services/synoptic.service';
import { SynopticSynchronizeUC } from '@synoptic/use-cases/synoptic-synchronize.uc';
import { SynopticListUC } from '@synoptic/use-cases/synoptic-list.uc';
import { SynopticFetchUC } from '@synoptic/use-cases/synoptic-fetch.uc';
import { SynopticDeleteUC } from '@synoptic/use-cases/synoptic-delete.uc';
import { SynopticIdDTO, SynopticSynchronizeDTO } from '../dto/synoptic.dto';

@Controller()
@UseFilters(new RpcErrorsFilter())
@UsePipes(new ValidationPipe({ transform: true, exceptionFactory: RpcValidationExceptionFactory }))
export class SynopticController {

    public constructor(private _synopticService: SynopticService) { }

    // sans _id : import d'un SVG (name + svg) ; avec _id : renommage, affectations, re-import du SVG
    @MessagePattern(['box/synchronize/synoptic'])
    public async synchronize(@Payload() synopticSynchronizeDTO: SynopticSynchronizeDTO): Promise<SynopticModel> {
        const uc = new SynopticSynchronizeUC(this._synopticService);
        return uc.execute(SynopticSynchronizeDTO.mapToModel(synopticSynchronizeDTO));
    }

    // onglets : liste sans svgJson
    @MessagePattern(['box/fetch/synoptics'])
    public async list(): Promise<SynopticSummaryModel[]> {
        const uc = new SynopticListUC(this._synopticService);
        return uc.execute();
    }

    @MessagePattern(['box/fetch/synoptic'])
    public async fetch(@Payload() synopticIdDTO: SynopticIdDTO): Promise<SynopticModel> {
        const uc = new SynopticFetchUC(this._synopticService);
        return uc.execute(synopticIdDTO._id);
    }

    @MessagePattern(['box/delete/synoptic'])
    public async delete(@Payload() synopticIdDTO: SynopticIdDTO): Promise<SynopticDeleteResultModel> {
        const uc = new SynopticDeleteUC(this._synopticService);
        return uc.execute(synopticIdDTO._id);
    }
}
