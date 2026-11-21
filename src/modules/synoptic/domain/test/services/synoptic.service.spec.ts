import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, Model } from 'mongoose';
import { BoxErrorCode } from '@framework/errors/box-error';
import { StartMongoMemory, StopMongoMemory } from '@process/domain/test/services/mongo-memory.spec-mock';
import { SynopticAssignmentType } from '@synoptic/domain/models/synoptic.model';
import { SynopticService, SYNOPTIC_MAX_SVG_BYTES } from '@synoptic/domain/services/synoptic.service';
import { SynopticRepository } from '@synoptic/infrastructure/repositories/synoptic.repository';
import { Synoptic, SynopticDocument, SynopticSchema } from '@synoptic/infrastructure/schemas/synoptic.schema';

const SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="400" height="400" viewBox="0 0 40 40">
  <!-- commentaire -->
  <g inkscape:label="Calque 1" transform="translate(1 2)">
    <rect id="s_element_pump" x="1" y="1" width="10" height="10" style="fill:#32404e;stroke:none"/>
    <text id="s_element_value_pump" x="12" y="8"><tspan>--</tspan></text>
    <circle id="s_element_tank" cx="20" cy="20" r="5"/>
  </g>
</svg>`;

const expectCode = async (promise: Promise<unknown>, code: BoxErrorCode): Promise<void> => {
    await expect(promise).rejects.toMatchObject({ code });
};

describe('SynopticService', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let synopticModel: Model<SynopticDocument>;
    let service: SynopticService;
    const sensorRepository = { get: jest.fn() };
    const cycleRepository = { get: jest.fn() };

    beforeAll(async () => {
        ({ mongod, connection } = await StartMongoMemory());
        synopticModel = connection.model(Synoptic.name, SynopticSchema) as never as Model<SynopticDocument>;
        await synopticModel.syncIndexes();
    }, 120000);

    afterAll(async () => StopMongoMemory(mongod, connection));

    beforeEach(async () => {
        await synopticModel.deleteMany({});
        jest.resetAllMocks();
        service = new SynopticService(
            new SynopticRepository(synopticModel),
            sensorRepository as never, cycleRepository as never
        );
    });

    describe('create', () => {
        it('should convert the SVG with svgson, index its elements and persist it', async () => {
            const created = await service.synchronize({ name: ' Serre principale ', svg: SVG });

            expect(created._id).toBeDefined();
            expect(created.name).toBe('Serre principale');
            expect(created.svgJson.name).toBe('svg');
            expect(created.svgJson.attributes.viewBox).toBe('0 0 40 40');
            expect(created.svgJson.attributes['xmlns:inkscape']).toBeDefined();
            expect(created.elements).toEqual({
                pump: { elementId: 's_element_pump', valueElementId: 's_element_value_pump', assignment: null },
                tank: { elementId: 's_element_tank', assignment: null }
            });
            const group = created.svgJson.children.find((child) => child.name === 'g');
            expect(group.attributes.transform).toBe('translate(1 2)');
            const pump = group.children.find((child) => child.attributes.id === 's_element_pump');
            expect(pump.attributes.style).toBe('fill:#32404e;stroke:none');
        });

        it('should reject a name already used, whatever its case', async () => {
            await service.synchronize({ name: 'Serre', svg: SVG });

            await expectCode(service.synchronize({ name: 'SERRE', svg: SVG }), BoxErrorCode.SYNOPTIC_NAME_ALREADY_USED);
        });

        it('should reject invalid, non-svg and oversized files', async () => {
            await expectCode(service.synchronize({ name: 'a', svg: '<svg><g></svg>' }), BoxErrorCode.SYNOPTIC_SVG_INVALID);
            await expectCode(service.synchronize({ name: 'b', svg: '<html><body/></html>' }), BoxErrorCode.SYNOPTIC_SVG_INVALID);
            await expectCode(
                service.synchronize({ name: 'c', svg: `<svg>${' '.repeat(SYNOPTIC_MAX_SVG_BYTES)}</svg>` }),
                BoxErrorCode.SYNOPTIC_SVG_TOO_LARGE
            );
            expect(await service.list()).toEqual([]);
        });
    });

    describe('assignments', () => {
        it('should save, restore after reload, then remove an assignment', async () => {
            const { _id } = await service.synchronize({ name: 'Serre', svg: SVG });
            sensorRepository.get.mockResolvedValue({ _id: 'sensor-1' });

            const sensorAssignment = { type: SynopticAssignmentType.SENSOR, targetId: 'sensor-1' };
            await service.synchronize({ _id, assignments: [{ key: 'pump', assignment: sensorAssignment }] });

            expect((await service.get(_id)).elements.pump.assignment).toEqual({ type: 'SENSOR', targetId: 'sensor-1' });
            expect(sensorRepository.get).toHaveBeenCalledWith('sensor-1');

            await service.synchronize({ _id, assignments: [{ key: 'pump', assignment: null }] });

            const reloaded = await service.get(_id);
            expect(reloaded.elements.pump.assignment).toBeNull();
            expect(reloaded.elements.tank).toBeDefined();
        });

        it('should reject an unknown element key or a missing target', async () => {
            const { _id } = await service.synchronize({ name: 'Serre', svg: SVG });
            cycleRepository.get.mockResolvedValue(null);

            await expectCode(
                service.synchronize({ _id, assignments: [{ key: 'nope', assignment: null }] }),
                BoxErrorCode.SYNOPTIC_ELEMENT_NOT_FOUND
            );
            await expectCode(
                service.synchronize({ _id, assignments: [{ key: 'pump', assignment: { type: SynopticAssignmentType.CYCLE, targetId: 'c-x' } }] }),
                BoxErrorCode.SYNOPTIC_TARGET_NOT_FOUND
            );
        });

        it.each([
            ['CYCLE', 'CYCLE', true], ['CYCLE', 'GROUP', true], ['CYCLE', 'MODULE', false], ['CYCLE', 'PROPORTIONAL', false],
            ['MODULE', 'MODULE', true], ['MODULE', 'PROPORTIONAL', true], ['MODULE', 'CYCLE', false], ['MODULE', 'GROUP', false]
        ])('should accept a %s assignment on a %s cycle: %s', async (type, cycleType, isAccepted) => {
            const { _id } = await service.synchronize({ name: 'Serre', svg: SVG });
            cycleRepository.get.mockResolvedValue({ _id: 'c-1', type: cycleType });
            const assignment = { type: type as SynopticAssignmentType, targetId: 'c-1' };

            const result = service.synchronize({ _id, assignments: [{ key: 'pump', assignment }] });

            if (isAccepted) {
                expect((await result).elements.pump.assignment).toEqual(assignment);
            } else {
                await expectCode(result, BoxErrorCode.SYNOPTIC_TARGET_NOT_FOUND);
            }
        });

        it('should allow navigation to another synoptic but not to itself', async () => {
            const first = await service.synchronize({ name: 'A', svg: SVG });
            const second = await service.synchronize({ name: 'B', svg: SVG });

            const updated = await service.synchronize({
                _id: first._id, assignments: [{ key: 'tank', assignment: { type: SynopticAssignmentType.SYNOPTIC, targetId: second._id } }]
            });

            expect(updated.elements.tank.assignment).toEqual({ type: 'SYNOPTIC', targetId: second._id });
            const selfAssignment = { type: SynopticAssignmentType.SYNOPTIC, targetId: first._id };
            await expectCode(
                service.synchronize({ _id: first._id, assignments: [{ key: 'tank', assignment: selfAssignment }] }),
                BoxErrorCode.SYNOPTIC_TARGET_NOT_FOUND
            );
        });

        it('should keep assignments of remaining elements when the SVG is re-imported', async () => {
            const { _id } = await service.synchronize({ name: 'Serre', svg: SVG });
            cycleRepository.get.mockResolvedValue({ _id: 'module-1', type: 'MODULE' });
            const moduleAssignment = { type: SynopticAssignmentType.MODULE, targetId: 'module-1' };
            await service.synchronize({ _id, assignments: [{ key: 'pump', assignment: moduleAssignment }] });

            const updated = await service.synchronize({ _id, svg: SVG.replace('s_element_tank', 's_element_valve') });

            expect(Object.keys(updated.elements).sort()).toEqual(['pump', 'valve']);
            expect(updated.elements.pump.assignment).toEqual({ type: 'MODULE', targetId: 'module-1' });
        });
    });

    describe('list / get / delete', () => {
        it('should list summaries without svgJson, in creation order', async () => {
            await service.synchronize({ name: 'B', svg: SVG });
            await service.synchronize({ name: 'A', svg: SVG });

            const list = await service.list();

            expect(list.map((summary) => summary.name)).toEqual(['B', 'A']);
            expect(list[0]).not.toHaveProperty('svgJson');
            expect(list[0].elementCount).toBe(2);
        });

        it('should delete a synoptic and clear navigations pointing to it', async () => {
            const first = await service.synchronize({ name: 'A', svg: SVG });
            const second = await service.synchronize({ name: 'B', svg: SVG });
            await service.synchronize({
                _id: first._id, assignments: [{ key: 'tank', assignment: { type: SynopticAssignmentType.SYNOPTIC, targetId: second._id } }]
            });

            expect(await service.delete(second._id)).toEqual({ _id: second._id, isDeleted: true });

            expect((await service.get(first._id)).elements.tank.assignment).toBeNull();
            await expectCode(service.get(second._id), BoxErrorCode.SYNOPTIC_NOT_FOUND);
            await expectCode(service.delete(second._id), BoxErrorCode.SYNOPTIC_NOT_FOUND);
        });
    });
});
