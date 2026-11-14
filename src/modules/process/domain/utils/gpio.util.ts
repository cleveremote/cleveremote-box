import { isRaspberryPi } from './platform.util';

// Sous-ensemble de l'API `onoff` utilise par la box, declare ici pour que le code compile sans le
// paquet : `onoff` (et son addon natif `epoll`) est une dependance optionnelle, absente hors
// Raspberry Pi. Aucun `import ... from 'onoff'` ne doit apparaitre ailleurs que dans loadGpio().
export type GpioBinaryValue = 0 | 1;
export type GpioDirectionValue = 'in' | 'out' | 'high' | 'low';
export type GpioEdgeValue = 'none' | 'rising' | 'falling' | 'both';
export type GpioOptions = { debounceTimeout?: number; activeLow?: boolean; reconfigureDirection?: boolean };

export interface GpioInstance {
    readSync(): GpioBinaryValue;
    writeSync(value: GpioBinaryValue): void;
    direction(): GpioDirectionValue;
    unexport(): void;
}

export interface GpioConstructor {
    accessible: boolean;
    new (gpio: number, direction: GpioDirectionValue, edge?: GpioEdgeValue, options?: GpioOptions): GpioInstance;
}

// null = deja evalue, indisponible (pas un Pi, ou `onoff` non installe / addon non compile)
let gpioCache: GpioConstructor | null = undefined;

// classe Gpio de `onoff`, chargee a la demande uniquement sur Raspberry Pi
export function loadGpio(): GpioConstructor | undefined {
    if (gpioCache === undefined) {
        gpioCache = null;
        if (isRaspberryPi()) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                gpioCache = require('onoff').Gpio as GpioConstructor;
            } catch {
                gpioCache = null;
            }
        }
    }
    return gpioCache ?? undefined;
}

// GPIO pilotables : Raspberry Pi + `onoff` charge + sysfs GPIO accessible
export function isGpioAvailable(): boolean {
    return loadGpio()?.accessible === true;
}
