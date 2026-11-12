import { Language } from '../i18n/language';
import { BoxError, BoxErrorCode, BoxErrorParams } from './box-error';

type ErrorMessage = (p: BoxErrorParams) => string;

const List = (values: BoxErrorParams[string], separator = ', '): string => Array.isArray(values) ? values.join(separator) : String(values ?? '');

// message affiche au front pour chaque code ; code absent (UNKNOWN...) : message technique de l'erreur
export const BOX_ERROR_MESSAGES: Record<Language, Partial<Record<BoxErrorCode, ErrorMessage>>> = {
    [Language.FR]: {
        [BoxErrorCode.VALIDATION]: (p) => `Données invalides (${List(p.fields)})`,
        [BoxErrorCode.REGISTER_MAP_NOT_FOUND]: (p) => `Aucune register map pour le type ${p.kind}`,
        [BoxErrorCode.OPERATION_NOT_FOUND]: (p) => `Opération ${p.blockId}.${p.operationId} inconnue pour ${p.kind}`,
        [BoxErrorCode.DEVICE_COMMAND_NOT_FOUND]: (p) => `Commande ${p.commandId} introuvable`,
        [BoxErrorCode.DEVICE_COMMAND_MODEL_MISMATCH]: (p) => `La commande ${p.commandId} ne s'applique pas à l'équipement ${p.deviceId}`,
        [BoxErrorCode.SLAVE_NOT_FOUND]: (p) => `Équipement ${p.deviceId} introuvable ou sans type`,
        [BoxErrorCode.MASTER_NOT_FOUND]: (p) => `Master ${p.masterDeviceId} de l'équipement ${p.deviceId} introuvable`,
        [BoxErrorCode.CONFIRMATION_REQUIRED]: () => 'Opération sensible : confirmation requise',
        [BoxErrorCode.PERSISTENCE_NOT_ALLOWED]: () => 'Écriture persistante non prévue pour cette opération',
        [BoxErrorCode.FIXED_VALUE_MISSING]: () => 'Valeur fixe absente du modèle',
        [BoxErrorCode.VALUE_NOT_IN_ENUM]: (p) => `Valeur ${p.value} non autorisée (attendu : ${List(p.allowed)})`,
        [BoxErrorCode.VALUE_OUT_OF_RANGE]: (p) => `Valeur ${p.value} hors plage : entier attendu entre ${p.min} et ${p.max}`,
        [BoxErrorCode.ARRAY_LENGTH_MISMATCH]: (p) => `${p.length} valeurs attendues`,
        [BoxErrorCode.RANGE_INVALID]: (p) => `Plage de voies invalide : 0 ≤ min ≤ max ≤ ${p.max}`,
        [BoxErrorCode.CHANNEL_OUT_OF_RANGE]: (p) => `Voie invalide : entier attendu entre 0 et ${p.max}`,
        [BoxErrorCode.FORMULA_INVALID]: (p) => `Formule invalide : ${p.formula}`,
        [BoxErrorCode.SLAVE_ADDRESS_INVALID]: () => 'Adresse invalide : 1 à 255',
        [BoxErrorCode.CYCLE_AUTO_CREATED_ONLY]: (p) => `Un cycle ${p.type} est uniquement créé automatiquement avec son équipement`,
        [BoxErrorCode.ANALOG_BOUNDS_INVALID]: () => 'Mise à l\'échelle : bornes non numériques',
        [BoxErrorCode.ANALOG_RANGE_DEGENERATE]: (p) => `Mise à l'échelle : plage d'entrée nulle (min = max = ${p.min})`,
        [BoxErrorCode.ANALOG_VALUE_NOT_NUMERIC]: (p) => `Valeur non numérique (${p.value})`,
        [BoxErrorCode.ANALOG_VALUE_OUT_OF_RANGE]: (p) => `Valeur ${p.value} hors de la plage d'entrée [${p.min}, ${p.max}]`,
        [BoxErrorCode.ANALOG_SIGNAL_UNKNOWN]: (p) => `Type de signal inconnu (${p.signalType})`,
        [BoxErrorCode.ANALOG_UNIT_INCOMPATIBLE]: (p) => `Unité ${p.unit} incompatible avec un signal ${p.signalType} (attendu : ${List(p.allowed)})`,
        [BoxErrorCode.ANALOG_SCALING_MISSING]: () => 'Mise à l\'échelle absente'
    },
    [Language.EN]: {
        [BoxErrorCode.VALIDATION]: (p) => `Invalid data (${List(p.fields)})`,
        [BoxErrorCode.REGISTER_MAP_NOT_FOUND]: (p) => `No register map for type ${p.kind}`,
        [BoxErrorCode.OPERATION_NOT_FOUND]: (p) => `Unknown operation ${p.blockId}.${p.operationId} for ${p.kind}`,
        [BoxErrorCode.DEVICE_COMMAND_NOT_FOUND]: (p) => `Command ${p.commandId} not found`,
        [BoxErrorCode.DEVICE_COMMAND_MODEL_MISMATCH]: (p) => `Command ${p.commandId} does not apply to device ${p.deviceId}`,
        [BoxErrorCode.SLAVE_NOT_FOUND]: (p) => `Device ${p.deviceId} not found or without type`,
        [BoxErrorCode.MASTER_NOT_FOUND]: (p) => `Master ${p.masterDeviceId} of device ${p.deviceId} not found`,
        [BoxErrorCode.CONFIRMATION_REQUIRED]: () => 'Sensitive operation: confirmation required',
        [BoxErrorCode.PERSISTENCE_NOT_ALLOWED]: () => 'Persistent write not supported for this operation',
        [BoxErrorCode.FIXED_VALUE_MISSING]: () => 'Fixed value missing from the template',
        [BoxErrorCode.VALUE_NOT_IN_ENUM]: (p) => `Value ${p.value} not allowed (expected: ${List(p.allowed)})`,
        [BoxErrorCode.VALUE_OUT_OF_RANGE]: (p) => `Value ${p.value} out of range: integer expected between ${p.min} and ${p.max}`,
        [BoxErrorCode.ARRAY_LENGTH_MISMATCH]: (p) => `${p.length} values expected`,
        [BoxErrorCode.RANGE_INVALID]: (p) => `Invalid channel range: 0 ≤ min ≤ max ≤ ${p.max}`,
        [BoxErrorCode.CHANNEL_OUT_OF_RANGE]: (p) => `Invalid channel: integer expected between 0 and ${p.max}`,
        [BoxErrorCode.FORMULA_INVALID]: (p) => `Invalid formula: ${p.formula}`,
        [BoxErrorCode.SLAVE_ADDRESS_INVALID]: () => 'Invalid address: 1 to 255',
        [BoxErrorCode.CYCLE_AUTO_CREATED_ONLY]: (p) => `A ${p.type} cycle can only be created automatically with its device`,
        [BoxErrorCode.ANALOG_BOUNDS_INVALID]: () => 'Scaling: non-numeric bounds',
        [BoxErrorCode.ANALOG_RANGE_DEGENERATE]: (p) => `Scaling: empty input range (min = max = ${p.min})`,
        [BoxErrorCode.ANALOG_VALUE_NOT_NUMERIC]: (p) => `Non-numeric value (${p.value})`,
        [BoxErrorCode.ANALOG_VALUE_OUT_OF_RANGE]: (p) => `Value ${p.value} outside the input range [${p.min}, ${p.max}]`,
        [BoxErrorCode.ANALOG_SIGNAL_UNKNOWN]: (p) => `Unknown signal type (${p.signalType})`,
        [BoxErrorCode.ANALOG_UNIT_INCOMPATIBLE]: (p) => `Unit ${p.unit} incompatible with a ${p.signalType} signal (expected: ${List(p.allowed)})`,
        [BoxErrorCode.ANALOG_SCALING_MISSING]: () => 'Scaling missing'
    },
    [Language.AR]: {
        [BoxErrorCode.VALIDATION]: (p) => `بيانات غير صالحة (${List(p.fields, '، ')})`,
        [BoxErrorCode.REGISTER_MAP_NOT_FOUND]: (p) => `لا توجد register map للنوع ${p.kind}`,
        [BoxErrorCode.OPERATION_NOT_FOUND]: (p) => `العملية ${p.blockId}.${p.operationId} غير معروفة لـ ${p.kind}`,
        [BoxErrorCode.DEVICE_COMMAND_NOT_FOUND]: (p) => `الأمر ${p.commandId} غير موجود`,
        [BoxErrorCode.DEVICE_COMMAND_MODEL_MISMATCH]: (p) => `الأمر ${p.commandId} لا ينطبق على الجهاز ${p.deviceId}`,
        [BoxErrorCode.SLAVE_NOT_FOUND]: (p) => `الجهاز ${p.deviceId} غير موجود أو بدون نوع`,
        [BoxErrorCode.MASTER_NOT_FOUND]: (p) => `الـ Master ${p.masterDeviceId} للجهاز ${p.deviceId} غير موجود`,
        [BoxErrorCode.CONFIRMATION_REQUIRED]: () => 'عملية حساسة: التأكيد مطلوب',
        [BoxErrorCode.PERSISTENCE_NOT_ALLOWED]: () => 'الكتابة الدائمة غير مدعومة لهذه العملية',
        [BoxErrorCode.FIXED_VALUE_MISSING]: () => 'القيمة الثابتة غير موجودة في النموذج',
        [BoxErrorCode.VALUE_NOT_IN_ENUM]: (p) => `القيمة ${p.value} غير مسموح بها (المتوقع: ${List(p.allowed, '، ')})`,
        [BoxErrorCode.VALUE_OUT_OF_RANGE]: (p) => `القيمة ${p.value} خارج النطاق: يُتوقع عدد صحيح بين ${p.min} و${p.max}`,
        [BoxErrorCode.ARRAY_LENGTH_MISMATCH]: (p) => `عدد القيم المتوقع: ${p.length}`,
        [BoxErrorCode.RANGE_INVALID]: (p) => `نطاق القنوات غير صالح: 0 ≤ min ≤ max ≤ ${p.max}`,
        [BoxErrorCode.CHANNEL_OUT_OF_RANGE]: (p) => `قناة غير صالحة: يُتوقع عدد صحيح بين 0 و${p.max}`,
        [BoxErrorCode.FORMULA_INVALID]: (p) => `معادلة غير صالحة: ${p.formula}`,
        [BoxErrorCode.SLAVE_ADDRESS_INVALID]: () => 'عنوان غير صالح: من 1 إلى 255',
        [BoxErrorCode.CYCLE_AUTO_CREATED_ONLY]: (p) => `لا تُنشأ دورة ${p.type} إلا تلقائيًا مع جهازها`,
        [BoxErrorCode.ANALOG_BOUNDS_INVALID]: () => 'التقييس: حدود غير رقمية',
        [BoxErrorCode.ANALOG_RANGE_DEGENERATE]: (p) => `التقييس: نطاق الدخل فارغ (min = max = ${p.min})`,
        [BoxErrorCode.ANALOG_VALUE_NOT_NUMERIC]: (p) => `قيمة غير رقمية (${p.value})`,
        [BoxErrorCode.ANALOG_VALUE_OUT_OF_RANGE]: (p) => `القيمة ${p.value} خارج نطاق الدخل [${p.min}, ${p.max}]`,
        [BoxErrorCode.ANALOG_SIGNAL_UNKNOWN]: (p) => `نوع إشارة غير معروف (${p.signalType})`,
        [BoxErrorCode.ANALOG_UNIT_INCOMPATIBLE]: (p) => `الوحدة ${p.unit} غير متوافقة مع إشارة ${p.signalType} (المتوقع: ${List(p.allowed, '، ')})`,
        [BoxErrorCode.ANALOG_SCALING_MISSING]: () => 'التقييس غير موجود'
    }
};

// Charge utile d'une RpcException : { code, params, message } ; message traduit dans `lang` si le code est connu,
// sinon message technique de l'erreur
export function ToErrorPayload(err: unknown, lang?: string): { code: BoxErrorCode; params?: BoxErrorParams; message: string } {
    if (!(err instanceof BoxError)) {
        return { code: BoxErrorCode.UNKNOWN, message: err instanceof Error ? err.message : String(err) };
    }
    const translate = BOX_ERROR_MESSAGES[lang as Language]?.[err.code];
    return { code: err.code, params: err.params, message: translate ? translate(err.params ?? {}) : err.message };
}
