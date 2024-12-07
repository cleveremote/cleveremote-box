import { Logger } from '@nestjs/common';
import { ExecutableStatus } from '../interfaces/executable.interface';
import { ModuleModel } from './module.model';
import { ConditionModel } from './condition.model';


export class SequenceModel {

    public id: string;
    public name: string;
    public description: string;
    public mapSectionId: string;
    public progression: { startedAt: Date; duration: number};
    public status: ExecutableStatus = ExecutableStatus.STOPPED;
    public maxDuration: number;
    public conditions: ConditionModel[];
    public modules: ModuleModel[] = [];

    public async reset(): Promise<void> {
        for (const module of this.modules) {
            try {
                module.execute(0);
            } catch (error) {
                Logger.warn(error, 'execution sequence id: ' + this.id);
            }
        }

        this.status = ExecutableStatus.STOPPED;
        this.progression = null;
    }
}
