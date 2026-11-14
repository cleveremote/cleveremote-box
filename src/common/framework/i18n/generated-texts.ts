import { Language } from './language';

// Textes enregistres par la box a la creation automatique d'elements (renommables par l'utilisateur),
// dans la langue par defaut de la box ; les noms techniques (AI1, DO1, Slave n (auto-detected)) restent tels quels
interface GeneratedTexts {
    discoveredMaster: (model: string) => string;
    detectedSlave: (master: string, register: string) => string;
    // sensors météo FORCAST créés au démarrage
    forcastSensor: { current: string; min: string; max: string };
}

export const GENERATED_TEXTS: Record<Language, GeneratedTexts> = {
    [Language.FR]: {
        discoveredMaster: (model) => `Master découvert automatiquement (${model})`,
        detectedSlave: (master, register) => `Détecté automatiquement sur le master "${master}" via le registre ${register}`,
        forcastSensor: {
            current: 'Température actuelle',
            min: 'Température min (prévision J+1)',
            max: 'Température max (prévision J+1)'
        }
    },
    [Language.EN]: {
        discoveredMaster: (model) => `Automatically discovered master (${model})`,
        detectedSlave: (master, register) => `Auto-detected on master "${master}" via register ${register}`,
        forcastSensor: {
            current: 'Current temperature',
            min: 'Min temperature (tomorrow forecast)',
            max: 'Max temperature (tomorrow forecast)'
        }
    },
    [Language.AR]: {
        discoveredMaster: (model) => `Master مكتشف تلقائيًا (${model})`,
        detectedSlave: (master, register) => `مكتشف تلقائيًا على الـ master "${master}" عبر السجل ${register}`,
        forcastSensor: {
            current: 'درجة الحرارة الحالية',
            min: 'درجة الحرارة الدنيا (توقعات الغد)',
            max: 'درجة الحرارة القصوى (توقعات الغد)'
        }
    }
};
