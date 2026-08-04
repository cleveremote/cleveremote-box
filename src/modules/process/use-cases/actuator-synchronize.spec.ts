import { MockClass } from '@framework/utils/test.utils';
import { ActuatorModel } from '@process/domain/models/actuator.model';
import { SynchronizeService } from '@process/domain/services/synchronize.service';
import { ActuatorSynchronizeUC } from './actuator-synchronize.uc';

describe('Process use case test', () => {
    it('Should execute actuator list sync and return a response dto', async () => {
        // GIVEN
        const synchronizeService = MockClass(SynchronizeService);
        jest.spyOn(synchronizeService, 'synchronizeActuatorList')
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .mockImplementation((_models: ActuatorModel[]): Promise<ActuatorModel[]> =>
                Promise.resolve().then(() => [new ActuatorModel()]));
        const actuatorModels = [new ActuatorModel()];

        // WHEN
        const uc = new ActuatorSynchronizeUC(synchronizeService);
        await uc.execute(actuatorModels);

        // THEN
        expect(synchronizeService.synchronizeActuatorList).toHaveBeenLastCalledWith(actuatorModels);
        expect(synchronizeService.synchronizeActuatorList).toHaveBeenCalledTimes(1);
    });
});
