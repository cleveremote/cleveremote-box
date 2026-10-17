import { SlaveTemplate } from '@process/domain/models/device.model';
import { SlaveTemplateService } from '@process/domain/services/slave-template.service';

export class SlaveTemplateSynchronizeUC {
    public constructor(private slaveTemplateService: SlaveTemplateService) { }

    public execute(template: SlaveTemplate): Promise<SlaveTemplate> {
        return this.slaveTemplateService.save(template);
    }
}
