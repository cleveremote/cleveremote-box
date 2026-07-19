import { Model } from 'mongoose';
import { AuthenticationRepository } from '@process/infrastructure/repositories/authentication.repository';
import { AuthenticationDocument } from '@process/infrastructure/schemas/authentication.schema';
import { AuthenticationModel } from '@process/domain/models/authentication.model';

describe('AuthenticationRepository', () => {
    let authenticationModel: { findOne: jest.Mock; findOneAndUpdate: jest.Mock };
    let repository: AuthenticationRepository;

    beforeEach(() => {
        authenticationModel = { findOne: jest.fn(), findOneAndUpdate: jest.fn() };
        repository = new AuthenticationRepository(authenticationModel as never as Model<AuthenticationDocument>);
    });

    describe('get', () => {
        it('should map and return the found authentication document', async () => {
            authenticationModel.findOne.mockResolvedValue({ _id: 'auth-1', login: 'admin', password: 'hashed' });

            const result = await repository.get();

            expect(authenticationModel.findOne).toHaveBeenCalled();
            expect(result).toEqual(Object.assign(new AuthenticationModel(), { id: 'auth-1', login: 'admin', password: 'hashed' }));
        });

        it('should return a fresh AuthenticationModel when none exists', async () => {
            authenticationModel.findOne.mockResolvedValue(null);

            const result = await repository.get();

            expect(result).toEqual(new AuthenticationModel());
        });
    });

    describe('update', () => {
        it('should upsert the single authentication document and return the mapped result', async () => {
            const entity = Object.assign(new AuthenticationModel(), { login: 'admin', password: 'hashed' });
            authenticationModel.findOneAndUpdate.mockResolvedValue({ _id: 'auth-1', login: 'admin', password: 'hashed' });

            const result = await repository.update(entity);

            expect(authenticationModel.findOneAndUpdate).toHaveBeenCalledWith(
                {},
                expect.objectContaining({ login: 'admin', password: 'hashed' }),
                { new: true, upsert: true, setDefaultsOnInsert: true }
            );
            expect(result).toEqual(Object.assign(new AuthenticationModel(), { id: 'auth-1', login: 'admin', password: 'hashed' }));
        });
    });
});
