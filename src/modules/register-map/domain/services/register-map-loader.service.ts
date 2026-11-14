import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RegisterMapTemplate } from '../models/register-map.model';
import { RegisterMapValidator } from '../utils/register-map.util';

// Register maps livrées avec le module (chemin relatif au répertoire de lancement)
export const REGISTER_MAPS_DIR = join('src', 'modules', 'register-map', 'register-maps');

/** Chargement de register maps depuis un dossier de fichiers JSON (un template par fichier) */
@Injectable()
export class RegisterMapLoader {

    public constructor(private readonly logger: Logger) { }

    /** Templates valides de `dir` ; les fichiers illisibles ou incohérents sont loggés et ignorés */
    public loadFromDirectory(dir: string, allowedKinds?: string[]): RegisterMapTemplate[] {
        let files: string[];
        try {
            files = readdirSync(dir).filter((f) => f.endsWith('.json'));
        } catch (err) {
            this.logger.warn({ dir, err: err.message }, 'register maps directory not readable');
            return [];
        }
        return files.flatMap((file) => {
            try {
                const template = JSON.parse(readFileSync(join(dir, file), 'utf8')) as RegisterMapTemplate;
                const errors = this.validate(template, allowedKinds);
                if (errors.length) {
                    this.logger.error({ file, errors }, 'invalid register map skipped');
                    return [];
                }
                return [template];
            } catch (err) {
                this.logger.error({ file, err: err.message }, 'register map not parsable');
                return [];
            }
        });
    }

    /** Incohérences du template ; vide = valide */
    public validate(template: RegisterMapTemplate, allowedKinds?: string[]): string[] {
        return RegisterMapValidator.validate(template, allowedKinds);
    }
}
