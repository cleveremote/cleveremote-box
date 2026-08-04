import { MockClass } from '@framework/utils/test.utils';
import { AuthenticationModel } from '@process/domain/models/authentication.model';
import { AuthenticationService } from '@process/domain/services/authentication.service';
import { AuthenticationCheckUC } from './authentication-check.uc';

describe('Process use case test', () => {
    it('Should execute password check and return a boolean', async () => {
        // GIVEN
        const authenticationService = MockClass(AuthenticationService);
        jest.spyOn(authenticationService, 'checkPassword')
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .mockImplementation((_data: AuthenticationModel): Promise<boolean> => Promise.resolve(true));
        const authenticationModel = new AuthenticationModel();

        // WHEN
        const uc = new AuthenticationCheckUC(authenticationService);
        const isValid = await uc.execute(authenticationModel);

        // THEN
        expect(authenticationService.checkPassword).toHaveBeenLastCalledWith(authenticationModel);
        expect(authenticationService.checkPassword).toHaveBeenCalledTimes(1);
        expect(isValid).toBe(true);
    });
});
