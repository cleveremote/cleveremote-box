import { Controller, UsePipes, ValidationPipe } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { SlaveTemplate } from '@process/domain/models/device.model';
import { SlaveTemplateService } from '@process/domain/services/slave-template.service';
import { SlaveTemplateSynchronizeUC } from '@process/use-cases/slave-template-synchronize.uc';
import { SlaveTemplateDTO } from '../dto/slave-template.dto';

@Controller()
@UsePipes(new ValidationPipe({ transform: true }))
export class SlaveTemplateController {

    public constructor(private _slaveTemplateService: SlaveTemplateService) { }

    /** Insère (ou met à jour) un seul slave template par message */
    @MessagePattern(['box/synchronize/slave-template'])
    public async synchronize(@Payload() slaveTemplateDTO: SlaveTemplateDTO): Promise<SlaveTemplate> {
        const uc = new SlaveTemplateSynchronizeUC(this._slaveTemplateService);
        return uc.execute(SlaveTemplateDTO.mapToSlaveTemplate(slaveTemplateDTO));
    }
}
