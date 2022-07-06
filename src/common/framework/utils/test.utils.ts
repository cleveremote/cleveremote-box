
export function MockClass<T>(c: new(...argsA: unknown[]) => T, ...argsB: unknown[]): T {
    return new c(...argsB);
}
