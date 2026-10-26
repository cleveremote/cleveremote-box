/* eslint-disable max-lines */
// Modélisation d'une register map (ex: register-maps/*.json) : table de registres complète d'un module,
// décrite pour que le front génère un banc de test (un widget par opération).
// Indépendant du fonctionnel : aucune notion de device, master, slave ou commande.

// Fonctions Modbus supportées (mêmes valeurs que les noms de méthodes modbus-serial)
export enum RegisterFunction {
    READ_COILS = 'readCoils', //01
    READ_DISCRETE_INPUTS = 'readDiscreteInputs', //02
    READ_HOLDING_REGISTERS = 'readHoldingRegisters', //03
    READ_INPUT_REGISTERS = 'readInputRegisters', //04
    WRITE_SINGLE_COIL = 'writeCoil', //05
    WRITE_SINGLE_REGISTER = 'writeRegister', //06
    WRITE_MULTIPLE_COILS = 'writeCoils', //15 (0F hex)
    WRITE_MULTIPLE_REGISTERS = 'writeRegisters', //16 (10 hex)
    CUSTOM_SINGLE_COIL = 'customCoil', //05 avec valeur 16 bits custom (ex: 0x5500 = toggle)
    CUSTOM_MULTIPLE_COILS = 'customCoils' //05 + valeur custom répétée sur chaque coil
}

export const READ_FUNCTIONS: RegisterFunction[] = [
    RegisterFunction.READ_COILS,
    RegisterFunction.READ_DISCRETE_INPUTS,
    RegisterFunction.READ_HOLDING_REGISTERS,
    RegisterFunction.READ_INPUT_REGISTERS
];

export type RegisterArea = 'coil' | 'discreteInput' | 'holdingRegister' | 'inputRegister';
export type RegisterAccess = 'r' | 'w' | 'rw';
// channel : une voie (adresse = start + index) ; range : toutes les voies ; fixed : adresse unique
export type OperationScope = 'channel' | 'range' | 'fixed';

export interface RegisterEnumEntry {
    value: number;
    label: string;
    hex?: string;
    // Valeur réellement émise sur le bus quand elle diffère de `value` (ex: ON = 1 → 0xFF00)
    wire?: string;
    description?: string;
}

export interface CompositeField {
    name: string;
    byte: 'high' | 'low';
    // Mot cible (0-based) pour une écriture multi-registres (défaut 0)
    word?: number;
    // Valeurs autorisées : enum ou plage [min, max]
    enum?: string;
    min?: number;
    max?: number;
    // bcd : l'octet porte deux chiffres décimaux (ex: 12 → 0x12)
    encoding?: 'binary' | 'bcd';
    default?: number;
}

// Types de données Modbus décodables sur un ou plusieurs mots de 16 bits
export type RegisterFieldType = 'int16' | 'uint16' | 'int32' | 'uint32' | 'float' | 'bits' | 'bcd' | 'bcdDateTime' | 'ascii' | 'hex';

export interface RegisterField {
    name: string;
    label: string;
    // Décalage (en mots) dans la lecture
    offset: number;
    type: RegisterFieldType;
    // Nombre de mots (défaut selon le type : 1 pour 16 bits, 2 pour 32 bits, 3 pour bcdDateTime)
    words?: number;
    unit?: string;
    // Unité lue sur l'équipement : libellé enum du code porté par `field` (champ de la lecture ou scopeFrom) ; `unit` sert de repli
    unitFrom?: { field: string; enum: string };
    // Formule mathjs : `raw` + valeurs brutes des autres champs de la lecture + scopeFrom
    formula?: string;
    // Libellés des valeurs (int) ou des bits (bits, valeur = index du bit)
    enum?: string;
    // Index du premier bit du mot (bits) dans le code complet (ex: mot de poids fort → 16)
    bitOffset?: number;
    // Valeur attendue (registres de test)
    expected?: number;
    description?: string;
}

export type OperationInput =
    | { type: 'none'; fixedValue?: number }
    | { type: 'enum'; enum: string; only?: string[] }
    | { type: 'number'; min: number; max: number; default?: number; scale?: number; unit?: string }
    | { type: 'boolean[]'; length: number }
    | { type: 'enum[]'; enum: string; length: number }
    // Une valeur par voie, chacune dans [min, max] (ex: consignes analogiques en mV, writeRegisters)
    | { type: 'number[]'; length: number; min: number; max: number; unit?: string }
    // `encode` n'est que documentaire : l'encodage réel se fait par octet (cf. CompositeField.byte)
    // Champs répartis par octet (et par mot si `word` > 0 : la valeur devient un tableau de mots)
    | { type: 'composite'; encode?: string; fields: CompositeField[] };

export type OperationResult =
    | { type: 'echo' }
    | { type: 'boolean[]' }
    | { type: 'number' }
    | { type: 'enum[]'; enum: string }
    | { type: 'version'; prefix?: string; decimals?: number }
    | { type: 'fields'; fields: RegisterField[] };

export interface RegisterOperation {
    id: string;
    label: string;
    function: RegisterFunction;
    fc: number;
    scope: OperationScope;
    // persistence.address : décalage ajouté à l'adresse quand la commande demande une écriture persistante
    // (ex: EEPROM du variateur SI23 = adresse + 0x1000) ; absent = écriture non persistable
    params?: { length?: number; formula?: string; persistence?: { address: number } };
    input?: OperationInput;
    result?: OperationResult;
    // Lectures préalables ("blockId.operationId") dont les champs alimentent les formules
    scopeFrom?: string[];
}

export interface RegisterBlock {
    id: string;
    label: string;
    description?: string;
    // Valeur usine (registres de paramètres), au format de la valeur décodée du 1er champ de la lecture
    defaultValue?: number | string;
    area: RegisterArea;
    access: RegisterAccess;
    // L'opération peut couper la communication (adresse, vitesse) : confirmation exigée
    danger?: boolean;
    // stride : écart entre deux voies/blocs (défaut 1), ex: historique de 32 blocs de 8 registres
    address: { start: number; count: number; stride?: number };
    operations: RegisterOperation[];
    examples?: { label: string; frame: string }[];
}

export interface RegisterMapHardware {
    manufacturer: string;
    model: string;
    protocolVersion?: string;
    documentation?: string;
    channels?: { outputs?: number; inputs?: number; labelStart: number };
    serial?: {
        baudRate: number;
        parity: string;
        dataBits: number;
        stopBits: number;
        // Valeurs réglables et mode de réglage (informatif)
        baudRates?: number[];
        parities?: string[];
        note?: string;
    };
    unitId?: { default: number; min: number; max: number; broadcast?: number };
    discoveryRegister?: number;
    // Nom de l'enum décrivant les codes d'exception Modbus
    exceptionCodes?: string;
    // Ordre des mots des valeurs 32 bits (défaut highFirst)
    wordOrder?: 'lowFirst' | 'highFirst';
    functionCodes?: number[];
    maxReadRegisters?: number;
    registerNumbering?: string;
}

export interface RegisterMapTemplate {
    _id?: string;
    name?: string;
    description?: string;
    // Identifiant du type de module décrit (libre pour le module, ex: DIGITAL_IO_8CH)
    kind: string;
    schemaVersion: number;
    conventions?: Record<string, string>;
    hardware: RegisterMapHardware;
    enums: Record<string, RegisterEnumEntry[]>;
    registerMap: RegisterBlock[];
    // Valeurs par défaut du device créé depuis ce template (libre pour le module, ex: portConfig)
    device?: Record<string, unknown>;
}

// Voie (scope 'channel') : index 0-based dans [min, max], affiché labelStart + index
export interface OperationChannelParam {
    min: number;
    max: number;
    labelStart: number;
}

// Champ composite résolu : enum remplacé par ses entrées
export type CompositeFieldParam = Omit<CompositeField, 'enum'> & { entries?: RegisterEnumEntry[] };

// Saisie résolue : comme OperationInput (hors 'none'), enums remplacés par leurs entrées (filtrées par `only`)
export type OperationValueParam =
    | { type: 'enum'; entries: RegisterEnumEntry[] }
    | { type: 'number'; min: number; max: number; default?: number; scale?: number; unit?: string }
    | { type: 'boolean[]'; length: number }
    | { type: 'enum[]'; length: number; entries: RegisterEnumEntry[] }
    | { type: 'number[]'; length: number; min: number; max: number; unit?: string }
    | { type: 'composite'; encode?: string; fields: CompositeFieldParam[] };

// Paramètres à fournir pour exécuter l'opération, prêts pour générer la saisie sans relire le template
export interface RegisterOperationParams {
    // scope 'channel' uniquement : voie à fournir
    channel?: OperationChannelParam;
    // scope 'range' uniquement : voies couvertes par la requête
    range?: OperationChannelParam;
    // Absent quand l'opération n'attend aucune saisie (input absent ou 'none')
    value?: OperationValueParam;
    // Bloc `danger` : isConfirmed requis
    isConfirmRequired: boolean;
    // operation.params.persistence présent : isPersistent possible
    isPersistable: boolean;
}

// Valeur saisie côté front : nombre (enum/number/none), tableau (boolean[]/enum[]) ou champs (composite)
export type RegisterOperationValue = number | boolean | (number | boolean)[] | Record<string, number>;

export interface RegisterOperationCommand {
    blockId: string;
    operationId: string;
    // Index 0-based de la voie (scope 'channel')
    channel?: number;
    value?: RegisterOperationValue;
    // Requis pour les blocs `danger`
    isConfirmed?: boolean;
    // Écriture persistante (mémorisée à la coupure) : adresse + operation.params.persistence.address
    isPersistent?: boolean;
}

// Requête Modbus brute prête à émettre
export interface RegisterRequest {
    function: RegisterFunction;
    address: number;
    length: number;
    value?: number | number[] | boolean[];
}

// Données brutes lues (bits ou mots) ; rien pour une écriture
export type RegisterRawData = (number | boolean)[] | void;

export interface DecodedChannel {
    index: number;
    // Numéro affiché (hardware.channels.labelStart + index)
    number: number;
    value: boolean | number;
    label?: string;
}

export interface DecodedField {
    name: string;
    label: string;
    raw: number | string;
    value: number | string;
    unit?: string;
    // Libellé enum (int) ou date formatée
    text?: string;
    // Bits actifs (type bits)
    flags?: string[];
    isExpected?: boolean;
}

export type DecodedValue =
    | { type: 'echo' }
    | { type: 'boolean[]'; channels: DecodedChannel[] }
    | { type: 'enum[]'; channels: DecodedChannel[] }
    | { type: 'number'; value: number }
    | { type: 'version'; value: number; text: string }
    | { type: 'fields'; fields: DecodedField[] };

export interface RegisterOperationError {
    message: string;
    modbusCode?: number;
    label?: string;
}

export interface RegisterOperationOutcome {
    isOk: boolean;
    blockId: string;
    operationId: string;
    request: RegisterRequest;
    raw?: (number | boolean)[];
    value?: DecodedValue;
    error?: RegisterOperationError;
    // Valeurs issues des lectures scopeFrom
    scope?: Record<string, number>;
    // Mêmes lectures scopeFrom, décodées (libellés enum, unités) pour l'affichage
    scopeFields?: DecodedField[];
    durationMs: number;
}
