import { ModbusTable } from '../models/simulated-device.model';
import { MeasurementProfile, MeasurementSignal, SignalTarget } from './measurement.behavior';

const HOLDING = ModbusTable.HOLDING;

// Grandeur sur un seul registre
function Walk(min: number, max: number, target: SignalTarget): MeasurementSignal {
    return { kind: 'walk', min, max, targets: [target] };
}

// Codage « entier int32 + centièmes uint16 » du débitmètre RS485 (formula `raw + xHundredths / 100`)
function Int32Hundredths(address: number): SignalTarget[] {
    return [
        { table: HOLDING, address, encoding: 'int32', part: 'integer' },
        { table: HOLDING, address: address + 2, encoding: 'uint16', part: 'hundredths' }
    ];
}

// Codage « entier int32 + fraction float » du compteur ultrasonique (formula `(raw + xFraction) * 10 ^ (flowDecimal - 3)`)
function Int32Fraction(address: number): SignalTarget[] {
    return [
        { table: HOLDING, address, encoding: 'int32', part: 'integer' },
        { table: HOLDING, address: address + 2, encoding: 'float', part: 'fraction' }
    ];
}

/**
 * Mesures simulées par kind (adresses et codages repris des blocs de lecture des register maps).
 * Un kind absent d'ici et sans behavior dédié est simulé par la seule banque de registres (ce qui est écrit se relit).
 */
export const MEASUREMENT_PROFILES: Record<string, MeasurementProfile> = {
    // comwintop-cwt-th-sensor.json : monitoring 0-1
    TEMPERATURE_MOISTURE_V1: {
        signals: [
            Walk(40, 70, { table: HOLDING, address: 0, encoding: 'uint16', scale: 0.1 }),
            Walk(18, 28, { table: HOLDING, address: 1, encoding: 'int16', scale: 0.1 })
        ]
    },
    // xidibei-xdb1001-7-soil-sensor.json : monitoring 0-3, azote 4, phosphore 7, potassium 8
    EC_METER_V1: {
        signals: [
            Walk(25, 45, { table: HOLDING, address: 0, encoding: 'uint16', scale: 0.1 }),
            Walk(15, 25, { table: HOLDING, address: 1, encoding: 'int16', scale: 0.1 }),
            Walk(300, 900, { table: HOLDING, address: 2, encoding: 'uint16' }),
            Walk(6, 7.5, { table: HOLDING, address: 3, encoding: 'uint16', scale: 0.1 }),
            Walk(20, 60, { table: HOLDING, address: 4, encoding: 'uint16' }),
            Walk(10, 40, { table: HOLDING, address: 7, encoding: 'uint16' }),
            Walk(50, 150, { table: HOLDING, address: 8, encoding: 'uint16' })
        ]
    },
    // pressure-level-transmitter.json : unité 2 (3 = bar), décimales 3, pv 4 (raw / 10 ^ décimales), gamme 5-6, pvFloat 22
    PRESSURE_V1: {
        statics: [
            { table: HOLDING, address: 2, value: 3 },
            { table: HOLDING, address: 3, value: 2 },
            { table: HOLDING, address: 5, value: 0 },
            { table: HOLDING, address: 6, value: 1000 }
        ],
        signals: [{
            kind: 'walk', min: 1.5, max: 3, targets: [
                { table: HOLDING, address: 4, encoding: 'int16', scale: 0.01 },
                { table: HOLDING, address: 22, encoding: 'float' }
            ]
        }]
    },
    // flowmeter-rs485.json : modèle 3 (0x2022), débit instantané 9 (L/min), total 12 (L), pression 15
    FLOWMETER_V1: {
        statics: [{ table: HOLDING, address: 3, value: 0x2022 }],
        signals: [
            { kind: 'walk', min: 20, max: 60, targets: Int32Hundredths(9) },
            { kind: 'counter', min: 0, max: 0, rate: 0.66, targets: Int32Hundredths(12) },
            { kind: 'walk', min: 1.5, max: 3, targets: Int32Hundredths(15) }
        ]
    },
    // ultrasonic-water-meter.json (lowFirst) : instantané 0-7, totalisateur 8, températures 32-35, totaux float 112-115,
    // décimales du débit 1438 (3 = valeur brute)
    FLOWMETER_ULTRASONIC_V1: {
        statics: [{ table: HOLDING, address: 1438, value: 3 }],
        signals: [
            Walk(1, 4, { table: HOLDING, address: 0, encoding: 'float' }),
            Walk(0.5, 1.5, { table: HOLDING, address: 4, encoding: 'float' }),
            Walk(1.5, 3, { table: HOLDING, address: 6, encoding: 'float' }),
            {
                kind: 'counter', min: 0, max: 0, rate: 0.0007, targets: [
                    ...Int32Fraction(8),
                    { table: HOLDING, address: 112, encoding: 'float' },
                    { table: HOLDING, address: 114, encoding: 'float' }
                ]
            },
            Walk(15, 25, { table: HOLDING, address: 32, encoding: 'float' }),
            Walk(15, 25, { table: HOLDING, address: 34, encoding: 'float' })
        ]
    },
    // waveshare-modbus-rtu-analog-input-8ch.json : 8 voies en input registers 0-7 (µA en 4-20 mA), gammes 0x1000-0x1007
    ANALOG_INPUT_8CH: {
        statics: Array.from({ length: 8 }, (_, i) => ({ table: HOLDING, address: 0x1000 + i, value: 3 })),
        signals: Array.from({ length: 8 }, (_, i) => Walk(4000, 20000, { table: ModbusTable.INPUT, address: i, encoding: 'uint16' }))
    }
};
