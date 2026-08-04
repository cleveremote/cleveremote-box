import { MockClass } from '@framework/utils/test.utils';
import { ActuatorModel } from '@process/domain/models/actuator.model';
import { SynchronizeService } from '@process/domain/services/synchronize.service';
import { ValveSynchronizeUC } from './valve-synchronize.uc';

describe('Process use case test', () => {
    it('Should execute valve sync and return a response dto', async () => {
        // GIVEN
        const synchronizeService = MockClass(SynchronizeService);
        jest.spyOn(synchronizeService, 'synchronizeValve')
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .mockImplementation((_model: ActuatorModel): Promise<ActuatorModel> =>
                Promise.resolve().then(() => new ActuatorModel()));
        const valveModel = new ActuatorModel();

        // WHEN
        const uc = new ValveSynchronizeUC(synchronizeService);
        await uc.execute(valveModel);

        // THEN
        expect(synchronizeService.synchronizeValve).toHaveBeenLastCalledWith(valveModel);
        expect(synchronizeService.synchronizeValve).toHaveBeenCalledTimes(1);
    });
});
