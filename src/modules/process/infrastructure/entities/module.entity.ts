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
        module.waitBeforeExec = moduleEntity.waitBeforeExec ?? 0;
        module.waitAfterExec = moduleEntity.waitAfterExec ?? 0;
        module.waitBeforeExecOff = moduleEntity.waitBeforeExecOff ?? 0;
        module.waitAfterExecOff = moduleEntity.waitAfterExecOff ?? 0;
        return module;
    }

    public static mapToEntity(moduleModel: ModuleModel): ModuleEntity {
        const module = new ModuleEntity();
        module.id = moduleModel.id;
        module.status = moduleModel.status;
        module.portNum = moduleModel.portNum;
        module.direction = moduleModel.direction;
        module.edge = moduleModel.edge;
        module.waitBeforeExec = moduleModel.waitBeforeExec ?? 0;
        module.waitAfterExec = moduleModel.waitAfterExec ?? 0;
        module.waitBeforeExecOff = moduleModel.waitBeforeExecOff ?? 0;
        module.waitAfterExecOff = moduleModel.waitAfterExecOff ?? 0;
        return module;
    }

}

