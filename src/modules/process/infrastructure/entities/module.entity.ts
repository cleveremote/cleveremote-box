/* eslint-disable max-lines-per-function */
import { ModuleModel } from '@process/domain/models/module.model';

export class ModuleEntity extends ModuleModel {

    public static mapToModel(moduleEntity: ModuleEntity): ModuleModel {
        const module = new ModuleModel();
        module.id = moduleEntity.id;
        module.status = moduleEntity.status;
        module.portNum = moduleEntity.portNum;
        module.direction = moduleEntity.direction;
        module.edge = moduleEntity.edge;
        module.configure();
        return module;
    }

    public static mapToEntity(moduleModel: ModuleModel): ModuleEntity {
        const module = new ModuleEntity();
        module.id = moduleModel.id;
        module.status = moduleModel.status;
        module.portNum = moduleModel.portNum;
        module.direction = moduleModel.direction;
        module.edge = moduleModel.edge;
        return module;
    }

}

