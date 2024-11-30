import { ExecutableStatus, ProcessType } from "../interfaces/executable.interface";
import { ExecutableType } from "./value.model";

export class ProcessValueModel {
    public id: string;
    public type: ExecutableType;
    public status: ExecutableStatus;
    public startedAt?: Date;
    public duration?: number;
    public causes?: { type: ProcessType; cause: string }[];
    public mapSectionId: string;
}