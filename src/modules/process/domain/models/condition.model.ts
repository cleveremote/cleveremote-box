import { ExecutableAction } from "../interfaces/executable.interface";
import { ElementType } from "./event.model";

export class ConditionModel {
    public name: string;
    public elementId: string;
    public elementType: ElementType;
    public operator: string;
    public value: ExecutableAction | number; 
}