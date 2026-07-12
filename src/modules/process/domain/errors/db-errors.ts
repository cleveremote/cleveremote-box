export class ElementNotFoundExeception extends Error {
    public constructor(id: string, action: string, entityName: string) {
        super(`cannot perform ${action} => element ${id} type of ${entityName} not found`);
    }
}

export class InvalidIdException extends Error {
    public constructor(id: string, entityName: string) {
        super(`invalid id "${id}" for ${entityName}: expected a valid uuid`);
    }
}