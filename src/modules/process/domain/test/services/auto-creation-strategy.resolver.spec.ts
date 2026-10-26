import { AutoCreationStrategyResolver } from '@process/domain/services/slave-provisioning/auto-creation/auto-creation-strategy.resolver';
import { AutoCreationStrategy } from '@process/domain/services/slave-provisioning/auto-creation/auto-creation-strategy.interface';
import {
    DeviceOnlyAutoCreationStrategy
} from '@process/domain/services/slave-provisioning/auto-creation/strategies/device-only-auto-creation.strategy';
import {
    AnalogOutputAutoCreationStrategy
} from '@process/domain/services/slave-provisioning/auto-creation/strategies/analog-output-auto-creation.strategy';
import { DeviceKind } from '@process/domain/models/device.model';

function CreateStrategy(kinds: DeviceKind[]): AutoCreationStrategy {
    return { kinds, build: jest.fn() };
}

describe('AutoCreationStrategyResolver', () => {
    const fallback = new DeviceOnlyAutoCreationStrategy();

    it('should resolve the strategy declaring the kind', () => {
        const digitalIo = CreateStrategy([DeviceKind.DIGITAL_IO_8_CH]);
        const analogOutput = new AnalogOutputAutoCreationStrategy();
        const resolver = new AutoCreationStrategyResolver([digitalIo, analogOutput], fallback);

        expect(resolver.resolve(DeviceKind.DIGITAL_IO_8_CH)).toBe(digitalIo);
        expect(resolver.resolve(DeviceKind.ANALOG_OUTPUT_8_CH)).toBe(analogOutput);
        expect(resolver.resolve(DeviceKind.ANALOG_OUTPUT_8_CH_MA)).toBe(analogOutput);
    });

    it('should fall back to the device only strategy for a kind without strategy', () => {
        const resolver = new AutoCreationStrategyResolver([CreateStrategy([DeviceKind.DIGITAL_IO_8_CH])], fallback);

        expect(resolver.resolve(DeviceKind.MODBUS_SLAVE)).toBe(fallback);
    });

    it('should throw when two strategies declare the same kind', () => {
        expect(() => new AutoCreationStrategyResolver(
            [CreateStrategy([DeviceKind.DIGITAL_IO_8_CH]), CreateStrategy([DeviceKind.DIGITAL_IO_8_CH])], fallback
        )).toThrow(DeviceKind.DIGITAL_IO_8_CH);
    });
});
