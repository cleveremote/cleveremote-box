import { readdir, readFile } from 'fs/promises';
import { resolveGpioLine } from './gpio-line';

// Jamais de vrai sysfs en test (la suite peut tourner sur le Raspberry Pi)
jest.mock('fs/promises', () => ({ readdir: jest.fn(), readFile: jest.fn() }));

const SYSFS = '/sys/class/gpio';
const DEBUGFS = '/sys/kernel/debug/gpio';

describe('resolveGpioLine', () => {
    // Faux systeme de fichiers : chemin -> contenu ; un chemin absent leve ENOENT
    function MockFs(chips: Record<string, { label: string; base: number; ngpio: number }>, debugfs?: string): void {
        const files: Record<string, string> = {};
        for (const [name, chip] of Object.entries(chips)) {
            files[`${SYSFS}/${name}/label`] = `${chip.label}\n`;
            files[`${SYSFS}/${name}/base`] = `${chip.base}\n`;
            files[`${SYSFS}/${name}/ngpio`] = `${chip.ngpio}\n`;
        }
        if (debugfs !== undefined) {
            files[DEBUGFS] = debugfs;
        }
        (readdir as jest.Mock).mockResolvedValue(['export', 'unexport', ...Object.keys(chips)]);
        (readFile as jest.Mock).mockImplementation(async (path: string) => {
            if (!(path in files)) {
                throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
            }
            return files[path];
        });
    }

    it('Pi 4, ancien noyau : base 0, le numero sysfs est le numero BCM', async () => {
        MockFs({
            gpiochip0: { label: 'pinctrl-bcm2711', base: 0, ngpio: 58 },
            gpiochip504: { label: 'raspberrypi-exp-gpio', base: 504, ngpio: 8 }
        });

        expect(await resolveGpioLine(21)).toBe(21);
    });

    it('Pi 4, noyau >= 6.6 : ajoute la base 512', async () => {
        MockFs({
            gpiochip512: { label: 'pinctrl-bcm2711', base: 512, ngpio: 58 },
            gpiochip570: { label: 'raspberrypi-exp-gpio', base: 570, ngpio: 8 }
        });

        expect(await resolveGpioLine(21)).toBe(533);
    });

    it('Pi 5 : ajoute la base du controleur RP1 et ignore les autres gpiochips', async () => {
        MockFs({
            gpiochip512: { label: 'gpio-brcmstb@107d508500', base: 512, ngpio: 32 },
            gpiochip544: { label: 'gpio-brcmstb@107d517c00', base: 544, ngpio: 17 },
            gpiochip571: { label: 'pinctrl-rp1', base: 571, ngpio: 54 }
        });

        expect(await resolveGpioLine(21)).toBe(592);
        expect(await resolveGpioLine(17)).toBe(588);
    });

    it('ne lit pas debugfs quand sysfs suffit (service sans droits root)', async () => {
        MockFs({ gpiochip571: { label: 'pinctrl-rp1', base: 571, ngpio: 54 } });

        await resolveGpioLine(21);

        expect(readFile).not.toHaveBeenCalledWith(DEBUGFS, 'utf8');
    });

    it('label inconnu : second recours sur debugfs', async () => {
        MockFs(
            { gpiochip600: { label: 'autre-controleur', base: 600, ngpio: 40 } },
            ' gpio-620 (GPIO20              )\n gpio-621 (GPIO21              |sysfs               ) out lo\n gpio-810 (GPIO210             )\n'
        );

        expect(await resolveGpioLine(21)).toBe(621);
    });

    it('rien de resolu : repli sur le numero BCM', async () => {
        MockFs({ gpiochip600: { label: 'autre-controleur', base: 600, ngpio: 40 } });

        expect(await resolveGpioLine(21)).toBe(21);
    });

    it('sysfs GPIO absent : repli sur le numero BCM', async () => {
        (readdir as jest.Mock).mockRejectedValue(new Error('ENOENT'));
        (readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));

        expect(await resolveGpioLine(21)).toBe(21);
    });
});
