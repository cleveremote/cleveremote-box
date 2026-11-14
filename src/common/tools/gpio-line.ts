import { readdir, readFile } from 'fs/promises';

const GPIO_SYSFS_ROOT = '/sys/class/gpio';
const GPIO_DEBUGFS_PATH = '/sys/kernel/debug/gpio';

// Controleur des broches du connecteur 40 points : Pi 0-3 (bcm2835), Pi 4 (bcm2711), Pi 5 (rp1)
const HEADER_CHIP_LABEL = /^pinctrl-(bcm2835|bcm2711|rp1)$/;

/**
 * Convertit un numero BCM en numero sysfs (celui attendu par onoff / /sys/class/gpio/export).
 * Les deux ne coincident que si la base du gpiochip vaut 0 (Pi <= 4 sur anciens noyaux) : elle vaut
 * 512 sur les noyaux >= 6.6 et ~570 sur le Pi 5, ou exporter le numero BCM brut echoue en EINVAL.
 */
export async function resolveGpioLine(bcmPin: number): Promise<number> {
    return (await resolveFromSysfsChips(bcmPin)) ?? (await resolveFromDebugfs(bcmPin)) ?? bcmPin;
}

// Base du gpiochip du connecteur, lue dans sysfs : lisible sans root, contrairement a debugfs
async function resolveFromSysfsChips(bcmPin: number): Promise<number | undefined> {
    try {
        for (const entry of await readdir(GPIO_SYSFS_ROOT)) {
            if (!entry.startsWith('gpiochip')) {
                continue;
            }
            const chipPath = `${GPIO_SYSFS_ROOT}/${entry}`;
            const label = (await readFile(`${chipPath}/label`, 'utf8')).trim();
            if (!HEADER_CHIP_LABEL.test(label)) {
                continue;
            }
            const base = Number((await readFile(`${chipPath}/base`, 'utf8')).trim());
            const ngpio = Number((await readFile(`${chipPath}/ngpio`, 'utf8')).trim());
            if (Number.isInteger(base) && bcmPin < ngpio) {
                return base + bcmPin;
            }
        }
    } catch {
        // sysfs GPIO absent ou illisible : on tente debugfs
    }
    return undefined;
}

// Second recours pour une carte au label inconnu : ligne "gpio-<sysfs> (GPIO<bcm> ...)" de debugfs (root)
async function resolveFromDebugfs(bcmPin: number): Promise<number | undefined> {
    try {
        const match = new RegExp(`gpio-(\\d+)\\s*\\(GPIO${bcmPin}\\b`, 'i').exec(await readFile(GPIO_DEBUGFS_PATH, 'utf8'));
        if (match) {
            return Number(match[1]);
        }
    } catch {
        // debugfs inaccessible (droits) : repli sur le numero BCM
    }
    return undefined;
}
