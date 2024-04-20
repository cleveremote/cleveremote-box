export class ElementNotFoundExeception extends Error {
    public constructor(id: string, action: string, entityName: string) {
        super(`cannot perform ${action} => element ${id} type of ${entityName} not found`);
    }
}