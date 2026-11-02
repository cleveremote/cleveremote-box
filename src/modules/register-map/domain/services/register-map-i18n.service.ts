import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RegisterMapTemplate, RegisterOperationOutcome } from '../models/register-map.model';
import { OrphanKeys, RegisterMapTranslation, TranslateOutcome, TranslateTemplate } from '../utils/register-map-i18n.util';

// Traductions livrées à côté des register maps (sous-dossier : ignoré par RegisterMapLoader)
export const REGISTER_MAPS_I18N_DIR = 'i18n';

/** Register maps traduites pour l'affichage (langue sans traduction ou inconnue : template source) */
@Injectable()
export class RegisterMapI18nService {

    // kind -> lang -> traduction
    private _translations = new Map<string, Map<string, RegisterMapTranslation>>();
    // `${kind}:${lang}` -> template traduit
    private _cache = new Map<string, RegisterMapTemplate>();

    public constructor(private readonly logger: Logger) { }

    /** Charge les traductions de `dir` ; clés orphelines (absentes de leur template) loggées */
    public loadFromDirectory(dir: string, templates: RegisterMapTemplate[]): void {
        let files: string[];
        try {
            files = readdirSync(dir).filter((f) => f.endsWith('.json'));
        } catch (err) {
            this.logger.warn({ dir, err: err.message }, 'register map translations directory not readable');
            return;
        }
        this._translations.clear();
        this._cache.clear();
        for (const file of files) {
            try {
                const translation = JSON.parse(readFileSync(join(dir, file), 'utf8')) as RegisterMapTranslation;
                const template = templates.find((t) => t.kind === translation.kind);
                if (!template || !translation.lang || !translation.texts) {
                    this.logger.error({ file, kind: translation.kind }, 'register map translation skipped (unknown kind or invalid)');
                    continue;
                }
                const orphans = OrphanKeys(template, translation);
                if (orphans.length) {
                    this.logger.warn({ file, orphans }, 'register map translation keys not found in template');
                }
                if (!this._translations.has(translation.kind)) this._translations.set(translation.kind, new Map());
                this._translations.get(translation.kind).set(translation.lang, translation);
            } catch (err) {
                this.logger.error({ file, err: err.message }, 'register map translation not parsable');
            }
        }
    }

    public translate(template: RegisterMapTemplate, lang: string | undefined): RegisterMapTemplate {
        const translation = lang && this._translations.get(template.kind)?.get(lang);
        if (!translation) {
            return template;
        }
        const key = `${template.kind}:${lang}`;
        let translated = this._cache.get(key);
        if (!translated) {
            translated = TranslateTemplate(template, translation);
            this._cache.set(key, translated);
        }
        return translated;
    }

    /**
     * Texte enregistré issu du template (rendu par `pick`) dans `lang` : reconnu s'il vaut ce rendu dans la langue
     * source ou l'une de ses traductions (le texte sert de code) ; texte personnalisé ou inconnu conservé tel quel.
     */
    public localize(template: RegisterMapTemplate, text: string | undefined, lang: string | undefined,
        pick: (template: RegisterMapTemplate) => string | undefined): string | undefined {
        if (!text) {
            return text;
        }
        const langs = [...(this._translations.get(template.kind)?.keys() ?? [])];
        const known = [pick(template), ...langs.map((l) => pick(this.translate(template, l)))];
        return known.includes(text) ? pick(this.translate(template, lang)) ?? text : text;
    }

    public translateOutcome(template: RegisterMapTemplate, outcome: RegisterOperationOutcome, lang: string | undefined): RegisterOperationOutcome {
        const translated = this.translate(template, lang);
        return translated === template ? outcome : TranslateOutcome(template, translated, outcome);
    }
}
