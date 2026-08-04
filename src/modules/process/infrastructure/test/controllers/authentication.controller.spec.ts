import { AuthenticationController } from '@process/infrastructure/controllers/authentication.controller';
import { AuthenticationService } from '@process/domain/services/authentication.service';
import { AuthenticationModel } from '@process/domain/models/authentication.model';

describe('AuthenticationController', () => {
    let authenticationService: { checkPassword: jest.Mock };
    let controller: AuthenticationController;

    beforeEach(() => {
        authenticationService = { checkPassword: jest.fn() };
        controller = new AuthenticationController(authenticationService as unknown as AuthenticationService);
    });

    describe('checkLogin', () => {
        it('should delegate the payload to AuthenticationService.checkPassword', async () => {
            authenticationService.checkPassword.mockResolvedValue(true);
            const payload: AuthenticationModel = { id: 'x', login: 'user', password: 'pass' };

            const isValid = await controller.checkLogin(payload);

            expect(isValid).toBe(true);
            expect(authenticationService.checkPassword).toHaveBeenCalledWith(payload);
        });

        it('should propagate a rejected check', async () => {
            authenticationService.checkPassword.mockResolvedValue(false);

            const isValid = await controller.checkLogin({ id: 'x', login: 'user', password: 'wrong' });

            expect(isValid).toBe(false);
        });
    });

    describe('checkConnection', () => {
        it('should always return true without touching the service', async () => {
            const isConnected = await controller.checkConnection();

            expect(isConnected).toBe(true);
            expect(authenticationService.checkPassword).not.toHaveBeenCalled();
        });
    });
});
