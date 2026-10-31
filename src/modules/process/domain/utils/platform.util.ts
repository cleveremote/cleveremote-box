import * as fs from 'fs';

// modèle de la carte exposé par le device tree (ex: "Raspberry Pi 4 Model B Rev 1.5\0") ;
// absent hors carte ARM à device tree (PC de dev, CI)
const DEVICE_TREE_MODEL_PATH = '/proc/device-tree/model';

let isRpiCache: boolean = undefined;

export function isRaspberryPi(): boolean {
    if (isRpiCache === undefined) {
        try {
            isRpiCache = fs.readFileSync(DEVICE_TREE_MODEL_PATH, 'utf8').includes('Raspberry Pi');
        } catch {
            isRpiCache = false;
        }
    }
    return isRpiCache;
}
