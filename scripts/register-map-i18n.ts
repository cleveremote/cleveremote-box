/* eslint-disable no-console */
// Traductions des register maps (src/modules/register-map/register-maps/i18n/<fichier>.<lang>.json)
//   npx ts-node -r tsconfig-paths/register scripts/register-map-i18n.ts check
//       clés orphelines (erreur) et couverture par langue
//   npx ts-node -r tsconfig-paths/register scripts/register-map-i18n.ts missing <lang> [fichier.json]
//       textes source restant à traduire (hors libellés techniques), au format { clé: texte source }
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { RegisterMapTemplate } from '../src/modules/register-map/domain/models/register-map.model';
import { REGISTER_MAPS_DIR } from '../src/modules/register-map/domain/services/register-map-loader.service';
import { REGISTER_MAPS_I18N_DIR } from '../src/modules/register-map/domain/services/register-map-i18n.service';
import { OrphanKeys, RegisterMapTranslation, TemplateTexts } from '../src/modules/register-map/domain/utils/register-map-i18n.util';

const LANGS = ['en', 'ar'];
const DIR = join(process.cwd(), REGISTER_MAPS_DIR);
const I18N_DIR = join(DIR, REGISTER_MAPS_I18N_DIR);

// Libellés techniques conservés tels quels dans toutes les langues
const TECHNICAL_TEXTS = [
    /^(ON|OFF|TOGGLE|N\/A)$/i,
    // nombres, plages, unités seules : "9600", "0-10 V", "4-20 mA", "m³/h"
    /^\d[\d\s.,~\-–/:×x+]*\s*[A-Za-zµΩ°³²%/]{0,6}$/,
    /^(V|mV|mA|µA|uA|A|Hz|kHz|W|kW|kWh|MWh|GJ|MJ|s|ms|min|h|m|cm|mm|m\/s|m³|m³\/h|m³\/s|L|L\/s|L\/min|L\/h|Pa|kPa|MPa|bar|psi|°C|°F|%|%RH|bps|rpm)$/,
    /^[\d\s.,~\-–/]+\s*(V|mV|mA|µA|Hz|kHz|bps|ms|s|°C|%|m³\/h|m³|L|kPa|MPa|bar)(\s*\(.*\))?$/,
    // codes paramètres (F00.03) et adresses (0x0002)
    /^(F|P|H|U|C)\d{2}\.\d{2}$/,
    /^0x[0-9A-F]+$/i,
    // format décimal ("##.##")
    /^[#.]+$/,
    // noms produits / sigles en majuscules ("WAVESHARE MODBUS RTU IO 8CH", "RS485")
    /^[A-Z0-9][A-Z0-9 \-()/.&+]*$/,
    // voies et valeurs : "CH1 = 1 mA", "CH1-8 4-20 mA", "CH1 ON", "CH2 Toggle", "9600 N (broadcast)"
    /^CH[\d-]+\s*(=\s*)?[\d.,-]*\s*(V|mV|mA|µA)?$/,
    /^CH[\d-]+ (ON|OFF|TOGGLE|Linkage|Toggle|Normal)$/,
    /^\d+ [NEO] \(broadcast\)$/,
    // format série parité,bits,stop ("N,8,1")
    /^[NEO],\d,\d$/
];

interface MapFile { file: string; template: RegisterMapTemplate }

function LoadTemplates(): MapFile[] {
    return readdirSync(DIR).filter((f) => f.endsWith('.json'))
        .map((file) => ({ file, template: JSON.parse(readFileSync(join(DIR, file), 'utf8')) as RegisterMapTemplate }));
}

// enums de codes d'exception Modbus et d'unités (unitFrom) : libellés techniques, utilisés tels quels au décodage
function TechnicalEnums(template: RegisterMapTemplate): Set<string> {
    const names = new Set<string>();
    if (template.hardware?.exceptionCodes) names.add(template.hardware.exceptionCodes);
    for (const block of template.registerMap ?? []) {
        for (const operation of block.operations ?? []) {
            if (operation.result?.type !== 'fields') continue;
            for (const field of operation.result.fields) {
                if (field.unitFrom) names.add(field.unitFrom.enum);
            }
        }
    }
    return names;
}

/** Textes à traduire du template : { clé: texte source } */
function TranslatableTexts(template: RegisterMapTemplate): Record<string, string> {
    const technicalEnums = TechnicalEnums(template);
    return Object.fromEntries(Object.entries(TemplateTexts(template)).filter(([key, text]) => {
        const enumName = key.startsWith('enums.') ? key.split('.')[1] : undefined;
        return !(enumName && technicalEnums.has(enumName)) && !TECHNICAL_TEXTS.some((re) => re.test(text.trim()));
    }));
}

function TranslationPath(file: string, lang: string): string {
    return join(I18N_DIR, `${basename(file, '.json')}.${lang}.json`);
}

function ReadTranslation(file: string, lang: string): RegisterMapTranslation | undefined {
    const path = TranslationPath(file, lang);
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as RegisterMapTranslation : undefined;
}

function Check(): number {
    let errors = 0;
    for (const { file, template } of LoadTemplates()) {
        const texts = TranslatableTexts(template);
        const total = Object.keys(texts).length;
        const coverage = LANGS.map((lang) => {
            const translation = ReadTranslation(file, lang);
            if (!translation) return `${lang} -`;
            if (translation.kind !== template.kind || translation.lang !== lang) {
                console.error(`  ${file} ${lang} : kind/lang incohérents (${translation.kind}/${translation.lang})`);
                errors++;
            }
            const orphans = OrphanKeys(template, translation);
            orphans.forEach((key) => console.error(`  ${file} ${lang} : clé orpheline ${key}`));
            errors += orphans.length;
            const done = Object.keys(texts).filter((key) => translation.texts[key]).length;
            return `${lang} ${done}/${total}`;
        });
        console.log(`${file.padEnd(48)} ${coverage.join('  ')}`);
    }
    return errors ? 1 : 0;
}

function Missing(lang: string, only?: string): number {
    const result: Record<string, Record<string, string>> = {};
    for (const { file, template } of LoadTemplates().filter((m) => !only || m.file === only)) {
        const translation = ReadTranslation(file, lang);
        const missing = Object.entries(TranslatableTexts(template)).filter(([key]) => !translation?.texts[key]);
        if (missing.length) result[file] = Object.fromEntries(missing);
    }
    console.log(JSON.stringify(result, null, 2));
    return 0;
}

const [command, lang, file] = process.argv.slice(2);
if (command === 'check') {
    process.exit(Check());
} else if (command === 'missing' && LANGS.includes(lang)) {
    process.exit(Missing(lang, file));
} else {
    console.error('usage : register-map-i18n.ts check | missing <en|ar> [fichier.json]');
    process.exit(2);
}
