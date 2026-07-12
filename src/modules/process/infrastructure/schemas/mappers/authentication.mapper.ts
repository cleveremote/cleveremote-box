import { AuthenticationModel } from '@process/domain/models/authentication.model';
import { Authentication, AuthenticationDocument } from '../authentication.schema';

export class AuthenticationMapper {

    public static mapToModel(authentication: AuthenticationDocument): AuthenticationModel {
        const model = new AuthenticationModel();
        model.id = authentication._id;
        model.login = authentication.login;
        model.password = authentication.password;
        return model;
    }

    public static mapToSchema(model: AuthenticationModel): Authentication {
        const authentication = new Authentication();
        authentication.login = model.login;
        authentication.password = model.password;
        return authentication;
    }

}
