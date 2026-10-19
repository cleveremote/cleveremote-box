import { SlaveTemplate as SlaveTemplateModel } from '@process/domain/models/device.model';
import { SlaveTemplate, SlaveTemplateDocument } from '../slave-template.schema';

export class SlaveTemplateMapper {

    public static mapToModel(template: SlaveTemplateDocument): SlaveTemplateModel {
        return {
            _id: template._id,
            name: template.name,
            description: template.description,
            kind: template.kind,
            device: template.device as SlaveTemplateModel['device'],
            comRequests: template.comRequests as SlaveTemplateModel['comRequests']
        };
    }

    public static mapToSchema(model: SlaveTemplateModel): SlaveTemplate {
        const template = new SlaveTemplate();
        template.name = model.name;
        template.description = model.description;
        template.kind = model.kind;
        template.device = { ...model.device };
        template.comRequests = model.comRequests.map((cr) => ({ ...cr }));
        return template;
    }

}
