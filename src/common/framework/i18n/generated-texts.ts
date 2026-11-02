import { Language } from './language';

// Textes enregistres par la box a la creation automatique d'elements (renommables par l'utilisateur),
// dans la langue par defaut de la box ; les noms techniques (AI1, DO1, Slave n (auto-detected)) restent tels quels
export const GENERATED_TEXTS: Record<Language, { discoveredMaster: (model: string) => string }> = {
    [Language.FR]: { discoveredMaster: (model) => `Master découvert automatiquement (${model})` },
    [Language.EN]: { discoveredMaster: (model) => `Automatically discovered master (${model})` },
    [Language.AR]: { discoveredMaster: (model) => `Master مكتشف تلقائيًا (${model})` }
};
