import { SvgNode, SynopticElementModel } from '../models/synoptic.model';

export const SYNOPTIC_ELEMENT_PREFIX = 's_element_';
export const SYNOPTIC_VALUE_PREFIX = 's_element_value_';

// la cle sert de cle de Map Mongo : ni '.' ni '$'
const KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

export type SynopticIdKind = { kind: 'element' | 'value'; key: string };

// s_element_value_<cle> est teste en premier : il commence aussi par s_element_
export function ParseSynopticId(id: string | undefined): SynopticIdKind | undefined {
    if (!id) { return undefined; }
    const [kind, prefix] = id.startsWith(SYNOPTIC_VALUE_PREFIX)
        ? ['value' as const, SYNOPTIC_VALUE_PREFIX]
        : id.startsWith(SYNOPTIC_ELEMENT_PREFIX) ? ['element' as const, SYNOPTIC_ELEMENT_PREFIX] : [undefined, undefined];
    if (!kind) { return undefined; }
    const key = id.slice(prefix.length);
    return KEY_PATTERN.test(key) ? { kind, key } : undefined;
}

function Walk(node: SvgNode, visit: (node: SvgNode) => void): void {
    visit(node);
    (node.children ?? []).forEach((child) => Walk(child, visit));
}

// Index des elements interactifs : une entree par s_element_<cle>, reliee a son s_element_value_<cle> s'il existe.
// Un s_element_value_ sans s_element_ correspondant n'est pas configurable : ignore. Id en double : le premier gagne.
export function ExtractSynopticElements(svgJson: SvgNode): Record<string, SynopticElementModel> {
    const elementIds = new Map<string, string>();
    const valueIds = new Map<string, string>();
    Walk(svgJson, (node) => {
        const id = node.attributes?.id;
        const parsed = ParseSynopticId(id);
        if (!parsed) { return; }
        const target = parsed.kind === 'element' ? elementIds : valueIds;
        if (!target.has(parsed.key)) { target.set(parsed.key, id); }
    });
    const elements: Record<string, SynopticElementModel> = {};
    elementIds.forEach((elementId, key) => {
        elements[key] = { elementId, valueElementId: valueIds.get(key), assignment: null };
    });
    return elements;
}

// Nouvel index apres (re)import : les affectations des cles encore presentes sont reprises
export function MergeSynopticElements(
    next: Record<string, SynopticElementModel>,
    previous: Record<string, SynopticElementModel> = {}
): Record<string, SynopticElementModel> {
    const merged: Record<string, SynopticElementModel> = {};
    Object.entries(next).forEach(([key, element]) => {
        merged[key] = { ...element, assignment: previous[key]?.assignment ?? null };
    });
    return merged;
}
