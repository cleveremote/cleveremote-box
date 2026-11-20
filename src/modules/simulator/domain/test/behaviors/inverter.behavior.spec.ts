import { InverterBehavior } from '../../behaviors/inverter.behavior';
import { ModbusTable } from '../../models/simulated-device.model';
import { SimulatedDevice } from '../../services/simulated-device';

const RUN_COMMAND = 0x2001;
const PID_FEEDBACK_COMMAND = 0x2009;
const C00 = 0x2100;
const AI1 = C00 + 16;
const F03_00 = 0x300;
const F03_01 = 0x301;
const F11_01 = 0xB01;
const F11_03 = 0xB03;
const F11_06 = 0xB06;
const F11_07 = 0xB07;
const F11_22 = 0xB16;
const F11_25 = 0xB19;
const F11_26 = 0xB1A;
const F11_27 = 0xB1B;

const CreateDevice = (): SimulatedDevice =>
    new SimulatedDevice({ id: 'vfd', kind: 'veichi', unitId: 1, tables: {} as never }, 0, 'lowFirst', new InverterBehavior());

const Write = (device: SimulatedDevice, address: number, value: number): void => {
    device.write(ModbusTable.HOLDING, address, [value]);
};

const Monitor = (device: SimulatedDevice, offset: number): number => device.read(ModbusTable.HOLDING, C00 + offset, 1)[0];

const Run = (device: SimulatedDevice, seconds: number): void => {
    for (let i = 0; i < seconds * 10; i++) {
        Write(device, 0x2101, 0); // trame quelconque : pas de perte de liaison
        device.tick(100);
    }
};

describe('InverterBehavior PID', () => {
    it('régule le capteur simulé (AI1) sur la consigne clavier F11.01', () => {
        const device = CreateDevice();
        Write(device, F11_01, 500);
        Write(device, RUN_COMMAND, 1);
        Run(device, 60);
        // process ∝ (f / 50 Hz)² = 50 % => f ≈ 35.36 Hz
        expect(Monitor(device, 9)).toBeGreaterThan(490);
        expect(Monitor(device, 9)).toBeLessThan(510);
        expect(Monitor(device, 1)).toBeGreaterThan(3450);
        expect(Monitor(device, 1)).toBeLessThan(3620);
        expect(Monitor(device, 8)).toBe(500);
    });

    it('met AI1 à l\'échelle F03 (2..10 V => 0..100 %) quand la tension est forcée', () => {
        const device = CreateDevice();
        Write(device, F03_00, 200);
        Write(device, AI1, 6000);
        Write(device, RUN_COMMAND, 1);
        Run(device, 0.1);
        expect(Monitor(device, 16)).toBe(6000);
        expect(Monitor(device, 9)).toBe(500);
        // tension sous le minimum : saturée au % bas
        Write(device, AI1, 1000);
        expect(Monitor(device, 9)).toBe(0);
        // % bas signé
        Write(device, F03_01, 0x10000 - 5000);
        expect(Monitor(device, 9)).toBe(-500);
        // 0xFFFF rend la main au capteur simulé
        Write(device, AI1, 0xFFFF);
        expect(Monitor(device, 16)).toBeGreaterThanOrEqual(2000);
        expect(Monitor(device, 16)).toBeLessThan(10000);
    });

    it('affiche consigne et retour sur la plage F11.06', () => {
        const device = CreateDevice();
        Write(device, F11_06, 100); // 10.0 (ex: bar)
        Write(device, F11_01, 500);
        Write(device, RUN_COMMAND, 1);
        expect(Monitor(device, 8)).toBe(50);
    });

    it('sature la sortie sur F11.22 et inverse la caractéristique avec F11.07', () => {
        const device = CreateDevice();
        Write(device, F11_03, 6);
        Write(device, PID_FEEDBACK_COMMAND, 0);
        Write(device, F11_22, 400);
        Write(device, RUN_COMMAND, 1);
        Run(device, 30);
        expect(Monitor(device, 1)).toBe(2000);
        // caractéristique négative : retour < consigne => sortie au minimum
        Write(device, F11_07, 0x0101);
        Run(device, 30);
        expect(Monitor(device, 1)).toBe(0);
    });

    it('passe en défaut E.PId sur coupure du retour (F11.26 = 1), effacé par runCommand = 7', () => {
        const device = CreateDevice();
        Write(device, F11_03, 6);
        Write(device, PID_FEEDBACK_COMMAND, 900);
        Write(device, F11_27, 800);
        Write(device, F11_25, 10);
        Write(device, F11_26, 1);
        Write(device, RUN_COMMAND, 1);
        Run(device, 0.5);
        expect(Monitor(device, 6)).toBe(1000);
        Run(device, 1);
        expect(Monitor(device, 6)).toBe(0);
        Write(device, PID_FEEDBACK_COMMAND, 500);
        Write(device, RUN_COMMAND, 7);
        Run(device, 0.1);
        expect(Monitor(device, 6)).toBe(1000);
    });
});
