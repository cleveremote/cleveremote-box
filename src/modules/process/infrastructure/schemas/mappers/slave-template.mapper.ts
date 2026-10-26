import { SlaveTemplate as SlaveTemplateModel } from '@process/domain/models/device.model';
import { SlaveTemplate, SlaveTemplateDocument } from '../slave-template.schema';

export class SlaveTemplateMapper {

    // deviceCommands : commandes du modèle (collection devicecommands), lues à part
    public static mapToModel(template: SlaveTemplateDocument, deviceCommands: SlaveTemplateModel['deviceCommands']): SlaveTemplateModel {
        return {
            _id: template._id,
            name: template.name,
            description: template.description,
            kind: template.kind,
            device: template.device as SlaveTemplateModel['device'],
            deviceCommands
        };
    }

    public static mapToSchema(model: SlaveTemplateModel): SlaveTemplate {
        const template = new SlaveTemplate();
        template.name = model.name;
        template.description = model.description;
        template.kind = model.kind;
        template.device = { ...model.device };
        return template;
    }

}
