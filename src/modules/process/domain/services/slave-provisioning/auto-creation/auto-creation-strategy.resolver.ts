import { Inject, Injectable } from '@nestjs/common';
import { DeviceKind } from '@process/domain/models/device.model';
import { AUTO_CREATION_STRATEGIES, AutoCreationStrategy } from './auto-creation-strategy.interface';
import { DeviceOnlyAutoCreationStrategy } from './strategies/device-only-auto-creation.strategy';

@Injectable()
export class AutoCreationStrategyResolver {
    private readonly _strategies = new Map<DeviceKind, AutoCreationStrategy>();

    public constructor(
        @Inject(AUTO_CREATION_STRATEGIES) strategies: AutoCreationStrategy[],
        private readonly fallback: DeviceOnlyAutoCreationStrategy
    ) {
        for (const strategy of strategies) {
            for (const kind of strategy.kinds) {
                if (this._strategies.has(kind)) {
                    throw new Error(`AutoCreationStrategyResolver: kind "${kind}" declared by several strategies`);
                }
                this._strategies.set(kind, strategy);
            }
        }
    }

    // kind sans stratégie dédiée : le slave est créé seul
    public resolve(kind: DeviceKind): AutoCreationStrategy {
        return this._strategies.get(kind) ?? this.fallback;
    }
}
