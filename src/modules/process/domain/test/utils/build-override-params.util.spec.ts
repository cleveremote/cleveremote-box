import { buildOverrideParams } from '@process/domain/utils/build-override-params.util';
import { buildOverrideParamsCases } from '../services/build-override-params.spec-mock';

describe('buildOverrideParams', () => {
    it.each(buildOverrideParamsCases)('$name', ({ existing, override, expected }) => {
        const result = buildOverrideParams(existing, override);

        expect(result).toEqual(expected);
    });
});
