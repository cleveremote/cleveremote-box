import { ExecutableAction } from "../interfaces/executable.interface";

export class ConditionModel {
    public id: string;
    public triggerId: string;
    public name: string;
    public description: string;
    public deviceId: string;
    public operator: string;
    public value: ExecutableAction | number;
}