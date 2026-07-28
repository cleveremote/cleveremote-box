import * as math from 'mathjs';
import { ExecutableStatus } from '@process/domain/interfaces/executable.interface';
import { ConditionModel } from '@process/domain/models/condition.model';
import { ElementType } from '@process/domain/models/event.model';
import { SensorValueModel } from '@process/domain/models/sensor-value.model';
import { ProcessValueModel } from '@process/domain/models/proccess-value.model';

export type DeviceValueResolver = (elementId: string) => Promise<SensorValueModel | ProcessValueModel | undefined>;

export async function evaluateConditions(conditions: ConditionModel[] | undefined, getDeviceValue: DeviceValueResolver): Promise<boolean> {
    if (!conditions?.length) {
        return true;
    }

    const parser = math.parser();

    const evaluateCondition = async (condition: ConditionModel): Promise<boolean> => {
        const extractedVal = await getDeviceValue(condition.elementId);
        if (!extractedVal) { return false; }
        const value = condition.elementType === ElementType.SENSOR
            ? (extractedVal as SensorValueModel).value
            : (extractedVal as ProcessValueModel).status;
        if (value === undefined || value === null) { return false; }
        const comparedValue = condition.elementType === ElementType.SENSOR
            ? Number(value)
            : (value === ExecutableStatus.STOPPED ? 0 : 1);
        return parser.evaluate(`(${comparedValue} ${condition.operator} ${Number(condition.value)})`);
    };

    const ordered = conditions
        .map((condition, index) => ({ condition, index }))
        .sort((a, b) => (a.condition.order ?? a.index) - (b.condition.order ?? b.index))
        .map((entry) => entry.condition);

    const parts: string[] = [];
    for (const condition of ordered) {
        const result = await evaluateCondition(condition);
        parts.push(`${condition.symbolStart ?? ''} ${result} ${condition.symbolEnd ?? ''}`.trim());
    }

    return Boolean(math.evaluate(parts.join(' ')));
}
