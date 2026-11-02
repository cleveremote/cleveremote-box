import { RegisterEnumEntry, RegisterMapTemplate, RegisterOperationOutcome } from '../models/register-map.model';

// Traductions d'une register map dans une langue (register-maps/i18n/<fichier>.<lang>.json) :
// clés stables dérivées des id (cf. VisitTemplateTexts) ; clé absente = texte source conservé,
// les libellés techniques (ON/OFF, unités, exceptions Modbus…) n'y figurent donc jamais.
export interface RegisterMapTranslation {
    kind: string;
    lang: string;
    texts: Record<string, string>;
}

type TextVisitor = (key: string, text: string, set: (value: string) => void) => void;

/** Parcourt les textes traduisibles du template avec leur clé de traduction */
export function VisitTemplateTexts(template: RegisterMapTemplate, visit: TextVisitor): void {
    const text = <T extends object>(key: string, owner: T | undefined, prop: keyof T & string): void => {
        const value = owner?.[prop];
        if (typeof value === 'string' && value) {
            visit(key, value, (translated) => { (owner as Record<string, unknown>)[prop] = translated; });
        }
    };
    text('name', template, 'name');
    text('description', template, 'description');
    text('hardware.serial.note', template.hardware?.serial, 'note');
    for (const [name, entries] of Object.entries(template.enums ?? {})) {
        for (const entry of entries) {
            text(`enums.${name}.${entry.value}.label`, entry, 'label');
            text(`enums.${name}.${entry.value}.description`, entry, 'description');
        }
    }
    for (const block of template.registerMap ?? []) {
        const blockKey = `blocks.${block.id}`;
        text(`${blockKey}.label`, block, 'label');
        text(`${blockKey}.description`, block, 'description');
        block.examples?.forEach((example, i) => text(`${blockKey}.examples.${i}.label`, example, 'label'));
        for (const operation of block.operations ?? []) {
            const operationKey = `${blockKey}.operations.${operation.id}`;
            text(`${operationKey}.label`, operation, 'label');
            if (operation.result?.type === 'fields') {
                for (const field of operation.result.fields) {
                    text(`${operationKey}.fields.${field.name}.label`, field, 'label');
                    text(`${operationKey}.fields.${field.name}.description`, field, 'description');
                }
            }
        }
    }
}

/** Textes source du template par clé (base des fichiers de traduction) */
export function TemplateTexts(template: RegisterMapTemplate): Record<string, string> {
    const texts: Record<string, string> = {};
    VisitTemplateTexts(template, (key, text) => { texts[key] = text; });
    return texts;
}

/** Clés de la traduction absentes du template (id renommé, bloc supprimé…) */
export function OrphanKeys(template: RegisterMapTemplate, translation: RegisterMapTranslation): string[] {
    const texts = TemplateTexts(template);
    return Object.keys(translation.texts).filter((key) => !(key in texts));
}

/**
 * Copie traduite du template, pour l'affichage uniquement : les libellés d'enum servant de filtre
 * (input.only) suivent leur traduction ; l'exécution utilise toujours le template source.
 */
export function TranslateTemplate(template: RegisterMapTemplate, translation: RegisterMapTranslation): RegisterMapTemplate {
    const translated = JSON.parse(JSON.stringify(template)) as RegisterMapTemplate;
    VisitTemplateTexts(translated, (key, _text, set) => {
        const value = translation.texts[key];
        if (value) set(value);
    });
    for (const block of translated.registerMap ?? []) {
        for (const operation of block.operations ?? []) {
            const input = operation.input;
            if (input?.type === 'enum' && input.only) {
                const labels = EnumLabelMap(template.enums[input.enum], translated.enums[input.enum]);
                input.only = input.only.map((label) => labels.get(label) ?? label);
            }
        }
    }
    return translated;
}

/** Résultat d'exécution aux libellés du template traduit (champs, valeurs d'enum, bits, exception Modbus) */
export function TranslateOutcome(
    template: RegisterMapTemplate, translated: RegisterMapTemplate, outcome: RegisterOperationOutcome
): RegisterOperationOutcome {
    const block = translated.registerMap.find((b) => b.id === outcome.blockId);
    const operation = block?.operations.find((o) => o.id === outcome.operationId);
    const enumLabels = (name: string | undefined): Map<string, string> =>
        EnumLabelMap(name ? template.enums[name] : undefined, name ? translated.enums[name] : undefined);
    const result: RegisterOperationOutcome = { ...outcome };
    const value = outcome.value;
    if (value?.type === 'fields' && operation?.result?.type === 'fields') {
        const fields = operation.result.fields;
        result.value = {
            ...value, fields: value.fields.map((decoded) => {
                const field = fields.find((f) => f.name === decoded.name);
                const labels = enumLabels(field?.enum);
                return {
                    ...decoded,
                    label: field?.label ?? decoded.label,
                    ...(decoded.text !== undefined && { text: labels.get(decoded.text) ?? decoded.text }),
                    ...(decoded.flags && { flags: decoded.flags.map((flag) => labels.get(flag) ?? flag) })
                };
            })
        };
    } else if (value?.type === 'enum[]' && operation?.result?.type === 'enum[]') {
        const labels = enumLabels(operation.result.enum);
        result.value = { ...value, channels: value.channels.map((c) => ({ ...c, label: c.label && (labels.get(c.label) ?? c.label) })) };
    }
    if (outcome.error?.label) {
        const label = enumLabels(template.hardware.exceptionCodes).get(outcome.error.label);
        result.error = { ...outcome.error, label: label ?? outcome.error.label };
    }
    return result;
}

// libellé source -> libellé traduit d'un enum (entrées dans le même ordre : le template traduit est une copie)
function EnumLabelMap(source: RegisterEnumEntry[] | undefined, translated: RegisterEnumEntry[] | undefined): Map<string, string> {
    return new Map((source ?? []).map((entry, i) => [entry.label, translated?.[i]?.label ?? entry.label]));
}
