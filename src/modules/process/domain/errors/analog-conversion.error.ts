import { BoxError, BoxErrorCode, BoxErrorParams } from '@framework/errors/box-error';

// Configuration de mise à l'échelle invalide, valeur non numérique, unité incompatible ou valeur hors plage (politique ERROR)
export class AnalogConversionError extends BoxError {
    public constructor(message: string, code: BoxErrorCode, params?: BoxErrorParams) {
        super(message, code, params);
    }
}
