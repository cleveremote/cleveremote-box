import { SvgNode } from '@synoptic/domain/models/synoptic.model';
import { ExtractSynopticElements, MergeSynopticElements, ParseSynopticId } from '@synoptic/domain/utils/synoptic-elements.util';

const node = (name: string, attributes: Record<string, string> = {}, children: SvgNode[] = []): SvgNode =>
    ({ name, type: 'element', value: '', attributes, children });

describe('synoptic-elements.util', () => {
    describe('ParseSynopticId', () => {
        it('should recognize value ids before element ids (both share the s_element_ prefix)', () => {
            expect(ParseSynopticId('s_element_value_12345')).toEqual({ kind: 'value', key: '12345' });
            expect(ParseSynopticId('s_element_12345')).toEqual({ kind: 'element', key: '12345' });
        });

        it('should ignore unrelated ids and keys unusable as Mongo map keys', () => {
            expect(ParseSynopticId(undefined)).toBeUndefined();
            expect(ParseSynopticId('path42')).toBeUndefined();
            expect(ParseSynopticId('s_element_')).toBeUndefined();
            expect(ParseSynopticId('s_element_a.b')).toBeUndefined();
            expect(ParseSynopticId('s_element_$x')).toBeUndefined();
        });
    });

    describe('ExtractSynopticElements', () => {
        it('should pair s_element_<key> with s_element_value_<key> anywhere in nested groups', () => {
            const svg = node('svg', {}, [
                node('g', { id: 'layer1' }, [
                    node('rect', { id: 's_element_pump' }),
                    node('g', {}, [node('text', { id: 's_element_value_pump' })])
                ]),
                node('circle', { id: 's_element_12345' })
            ]);

            expect(ExtractSynopticElements(svg)).toEqual({
                pump: { elementId: 's_element_pump', valueElementId: 's_element_value_pump', assignment: null },
                12345: { elementId: 's_element_12345', valueElementId: undefined, assignment: null }
            });
        });

        it('should ignore a value element without interactive element and keep the first duplicate', () => {
            const svg = node('svg', {}, [
                node('text', { id: 's_element_value_orphan' }),
                node('rect', { id: 's_element_1', 'data-first': 'yes' }),
                node('rect', { id: 's_element_1' })
            ]);

            expect(Object.keys(ExtractSynopticElements(svg))).toEqual(['1']);
        });
    });

    describe('MergeSynopticElements', () => {
        it('should keep assignments of keys still present and drop the others', () => {
            const previous = {
                a: { elementId: 's_element_a', assignment: { type: 'SENSOR', targetId: 's1' } },
                gone: { elementId: 's_element_gone', assignment: { type: 'CYCLE', targetId: 'c1' } }
            } as never;
            const next = {
                a: { elementId: 's_element_a', valueElementId: 's_element_value_a', assignment: null },
                b: { elementId: 's_element_b', assignment: null }
            };

            expect(MergeSynopticElements(next, previous)).toEqual({
                a: { elementId: 's_element_a', valueElementId: 's_element_value_a', assignment: { type: 'SENSOR', targetId: 's1' } },
                b: { elementId: 's_element_b', assignment: null }
            });
        });
    });
});
