
export function MockClass<T>(c: new(...argsA: unknown[]) => T, ...argsB: unknown[]): T {
    return new c(...argsB);
}
export class MockFactory<T> {

    public model: T;

    public constructor(c:  new(...args: unknown[]) => T, ...params: unknown[]) {
        this.model = MockClass(c, ...params);
    }

}
