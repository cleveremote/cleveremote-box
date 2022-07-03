import { StructureModel } from '@order/domain/models/structure.model';

describe('StructureModel model', () => {
    it ('Should create a new structure Model', () => {
        const structure = new StructureModel();
        expect(structure).toBeDefined();
    });
});
