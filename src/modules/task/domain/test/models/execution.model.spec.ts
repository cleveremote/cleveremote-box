import { ExecutionModel } from '@order/domain/models/execution.model';

describe('ExecutionModel model', () => {
    it ('Should create a new execution Model', () => {
        const execution = new ExecutionModel();
        expect(execution).toBeDefined();
    });
});
