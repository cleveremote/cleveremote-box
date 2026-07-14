import { InvalidIdException } from '@process/domain/errors/db-errors';

describe('InvalidIdException', () => {
    it('should be an instance of Error', () => {
        const error = new InvalidIdException('abc', 'Sensor');

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(InvalidIdException);
    });

    it('should build a message containing the id and entity name', () => {
        const error = new InvalidIdException('abc', 'Sensor');

        expect(error.message).toEqual('invalid id "abc" for Sensor: expected a valid uuid');
    });
});
