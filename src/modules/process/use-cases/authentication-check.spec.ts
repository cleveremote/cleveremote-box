import { MockClass } from '@framework/utils/test.utils';
import { AuthenticationModel } from '@process/domain/models/authentication.model';
import { AuthenticationResultModel, AuthenticationStatus } from '@process/domain/models/authentication-result.model';
import { AuthenticationService } from '@process/domain/services/authentication.service';
import { AuthenticationCheckUC } from './authentication-check.uc';

describe('Process use case test', () => {
    it('Should execute password check and return the authentication result', async () => {
        // GIVEN
        const authenticationService = MockClass(AuthenticationService);
        const expected: AuthenticationResultModel = { success: true, status: AuthenticationStatus.SUCCESS, message: 'Connexion réussie' };
        jest.spyOn(authenticationService, 'manageAuthentication')
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .mockImplementation((_data: AuthenticationModel): Promise<AuthenticationResultModel> => Promise.resolve(expected));
        const authenticationModel = new AuthenticationModel();

        // WHEN
        const uc = new AuthenticationCheckUC(authenticationService);
        const result = await uc.execute(authenticationModel);

        // THEN
        expect(authenticationService.manageAuthentication).toHaveBeenLastCalledWith(authenticationModel);
        expect(authenticationService.manageAuthentication).toHaveBeenCalledTimes(1);
        expect(result).toBe(expected);
    });
});
