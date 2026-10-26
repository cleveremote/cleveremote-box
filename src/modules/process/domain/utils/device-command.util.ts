import { RegisterOperationOutcome } from '@register-map/domain/models/register-map.model';
import { DeviceCommandModel, DeviceCommandType } from '../models/device-command.model';

export interface DeviceCommandValue {
    name: string;
    value: number;
    unit?: string;
}

/** La commande porte cet usage (une commande peut en cumuler plusieurs, ex: init + reset) */
export function hasCommandType(command: Pick<DeviceCommandModel, 'types'>, type: DeviceCommandType): boolean {
    return command.types?.includes(type) ?? false;
}

/**
 * Valeurs numériques d'un résultat de DeviceCommand : champs décodés (tous les numériques, ou `field`),
 * valeur unique (number / version) ou une entrée par voie (boolean[] / enum[]).
 * Lève une erreur si l'exécution a échoué ou si `field` est absent du résultat.
 */
export function outcomeValues(outcome: RegisterOperationOutcome, field?: string): DeviceCommandValue[] {
    const name = `${outcome.blockId}.${outcome.operationId}`;
    if (!outcome.isOk) {
        const { message, label } = outcome.error ?? { message: 'échec' };
        throw new Error(`${name} : ${message}${label ? ` (${label})` : ''}`);
    }
    const value = outcome.value;
    switch (value?.type) {
        case 'fields': {
            const fields = value.fields.filter((f) => typeof f.value === 'number' && (!field || f.name === field));
            if (field && !fields.length) {
                throw new Error(`${name} : champ numérique "${field}" absent du résultat`);
            }
            return fields.map((f) => ({ name: f.name, value: f.value as number, unit: f.unit }));
        }
        case 'number':
        case 'version':
            return [{ name, value: value.value }];
        case 'boolean[]':
        case 'enum[]':
            return value.channels.map((c) => ({ name: `${name}.${c.number}`, value: Number(c.value) }));
        default:
            return [];
    }
}
