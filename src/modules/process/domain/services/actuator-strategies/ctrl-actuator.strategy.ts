import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import ModbusRTU from 'modbus-serial';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { DeviceModel, MasterConfigModel, MasterProtocol, SlaveConfigModel } from '@process/domain/models/device.model';
import { ActuatorModel, CtrlActuatorConfigModel } from '@process/domain/models/actuator.model';
import { ActuatorType } from '../../interfaces/actuator-module.interface';
import { ActuatorStrategy } from './actuator-strategy.interface';
import { AO8CH_DEVICE_ADDRESS_REGISTER, BROADCAST_UNIT_ID } from '@process/domain/utils/modbus-registers.util';
import { UNREACHABLE_NETWORK_CODES, WaveshareDiscoveryService } from '@process/domain/services/waveshare-discovery.service';
import { DeviceCommandType } from '@process/domain/models/device-command.model';
import { DeviceCommandService } from '../device-command.service';
import { RegulationService } from '../regulation.service';

type ValveActuatorModel = ActuatorModel & { config: CtrlActuatorConfigModel };

// Waveshare "Modbus RTU Analog Output 8CH" - registers 0x0000-0x0007 hold the
// output value of channels 1-8, expressed in microamps.
// Function codes: 0x03 read, 0x06 write single register, 0x10 write multiple registers.
// La vanne fonctionne en boucle 4-20mA (live zero) : <4mA est interprété par
// l'actionneur comme une coupure/erreur de boucle, pas comme une consigne 0%.
// On ne doit donc jamais commander un courant inférieur à MIN_OUTPUT_MA.
const AO8CH_CHANNEL_BASE_ADDRESS = 0x0000;
const MIN_OUTPUT_MA = 4;
const MAX_OUTPUT_MA = 20;
const MIN_OUTPUT_UA = MIN_OUTPUT_MA * 1000;
const MAX_OUTPUT_UA = MAX_OUTPUT_MA * 1000;

@Injectable()
export class CtrlActuatorStrategy implements ActuatorStrategy {
    public readonly type = ActuatorType.CTRL;

    public constructor(
        private deviceRepository: DeviceRepository,
        private waveshareDiscoveryService: WaveshareDiscoveryService,
        private readonly logger: Logger,
        private deviceCommandService: DeviceCommandService,
        private regulationService: RegulationService
    ) { }

    // commandes init de la vanne (ex: plage de sortie du module AO)
    public async init(actuator: ActuatorModel): Promise<void> {
        const { deviceId, actions } = actuator.config as CtrlActuatorConfigModel;
        await this.deviceCommandService.runActions(deviceId, actions, DeviceCommandType.INIT);
    }

    // commandes reset de la vanne ; à défaut, ouverture minimale (set 0 -> 4mA)
    public async reset(actuator: ActuatorModel): Promise<void> {
        const { deviceId, actions } = actuator.config as CtrlActuatorConfigModel;
        if (!(await this.deviceCommandService.actionsOfType(actions, DeviceCommandType.RESET)).length) {
            await this._writeOpening(actuator.config as CtrlActuatorConfigModel, 0);
            (actuator.config as CtrlActuatorConfigModel).openingPercent = 0;
            return;
        }
        await this.deviceCommandService.runActions(deviceId, actions, DeviceCommandType.RESET);
    }

    /**
     * ON sous ControlLoop active : régulation sur la consigne de la boucle (RegulationService / module control),
     * la vanne étant pilotée via position(). Sinon `action` est l'ouverture cible en % (positionnement direct).
     */
    public async set(actuator: ActuatorModel, action: number): Promise<void> {
        const loop = action !== 0 ? await this.regulationService.findLoop(actuator) : null;
        if (!loop) {
            return this.position(actuator, action);
        }
        await this.regulationService.regulate(actuator, loop, {
            write: (openingPercent: number) => this.position(actuator, openingPercent),
            settleMs: (delta: number) => this.positioningDelayMs(actuator, delta)
        });
    }

    // positionnement direct, borné à [minOpening, maxOpening]
    public async position(actuator: ActuatorModel, openingPercent: number): Promise<void> {
        const config = (actuator as ValveActuatorModel).config;
        const clamped = Math.min(config.maxOpening, Math.max(config.minOpening, openingPercent));
        const outputValue = await this._writeOpening(config, clamped);
        config.openingPercent = clamped;
        this.logger.debug({ valveId: actuator._id, openingPercent: clamped, outputValue }, 'valve opening written');
    }

    public async read(actuator: ActuatorModel): Promise<number> {
        return (actuator.config as CtrlActuatorConfigModel).openingPercent;
    }

    // temps physique estime pour que la vanne rejoigne sa nouvelle position : course complete
    // (minOpening <-> maxOpening) en config.fullStrokeMs, proportionnellement moins pour un
    // deplacement partiel.
    public positioningDelayMs(actuator: ActuatorModel, openingDeltaPercent: number): number {
        const config = (actuator as ValveActuatorModel).config;
        const fullRange = config.maxOpening - config.minOpening;
        if (fullRange <= 0) return 0;
        return (Math.abs(openingDeltaPercent) / fullRange) * config.fullStrokeMs;
    }

    private _delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private _toClampedMicroAmps(milliAmps: number): number {
        const clampedMa = Math.min(Math.max(milliAmps, MIN_OUTPUT_MA), MAX_OUTPUT_MA);
        return Math.min(Math.max(Math.round(clampedMa * 1000), MIN_OUTPUT_UA), MAX_OUTPUT_UA);
    }

    // DeviceCommand set (register map) : l'ouverture est projetee sur [minOutputValue, maxOutputValue]
    // (0% -> minOutputValue, 100% -> maxOutputValue), à défaut sur la plage de saisie du template
    // (ex: AO8CH B outputs.set 0-10000 mV), puis bornée à cette plage. Passe par la file de
    // ModbusBusService (bus RS485 partagé). Renvoie la valeur écrite.
    private async _writeOpening(config: CtrlActuatorConfigModel, openingPercent: number): Promise<number> {
        const { deviceId, actions } = config;
        const [set] = await this.deviceCommandService.actionsOfType(actions, DeviceCommandType.SET);
        if (!set) {
            throw new Error('CtrlActuatorStrategy: vanne sans commande set');
        }
        const range = await this.deviceCommandService.numberRange(set.command._id, deviceId);
        if (!range) {
            throw new Error(`CtrlActuatorStrategy: DeviceCommand ${set.command._id} sans saisie numérique`);
        }
        const min = config.minOutputValue ?? range.min;
        const max = config.maxOutputValue ?? range.max;
        const value = Math.min(range.max, Math.max(range.min, Math.round(min + (openingPercent / 100) * (max - min))));
        await this.deviceCommandService.execute(set.command, deviceId, { channel: set.action.channel, value });
        return value;
    }

    private async _connectClient(deviceId: string, unitIdOverride?: number): Promise<ModbusRTU> {
        const slaveDevice = await this.deviceRepository.get(deviceId) as DeviceModel;
        if (!slaveDevice) {
            throw new Error(`no slave device found for deviceId: ${deviceId}`);
        }
        const slaveConfig = slaveDevice.config as SlaveConfigModel;
        const masterDevice = await this.deviceRepository.get(slaveConfig.masterDeviceId) as DeviceModel;
        if (!masterDevice) {
            throw new Error(`No master device found for masterDeviceId: ${slaveConfig.masterDeviceId}`);
        }
        const masterConfig = masterDevice.config as MasterConfigModel;

        const client = new ModbusRTU();
        if (masterConfig.protocol === MasterProtocol.TCP) {
            try {
                await client.connectTCP(masterConfig.ipAddress, { port: masterConfig.port });
            } catch (err) {
                // IP obsolète (master en DHCP) : on la retrouve par son deviceId puis on retente une fois
                if (!UNREACHABLE_NETWORK_CODES.includes(err.code) || !await this.waveshareDiscoveryService.refreshMasterAddress(masterConfig)) {
                    throw err;
                }
                await client.connectTCP(masterConfig.ipAddress, { port: masterConfig.port });
            }
        } else if (masterConfig.protocol === MasterProtocol.RTU) {
            await client.connectRTUBuffered(masterConfig.path, { baudRate: masterConfig.baudRate || 9600 });
        } else {
            throw new Error(`Unknown protocol: ${masterConfig.protocol}`);
        }
        client.setID(unitIdOverride ?? slaveConfig.slaveId);
        client.setTimeout(masterConfig.timeout || 2000);
        return client;
    }

    /**
     * TEST - positionne l'adresse esclave Modbus du module Waveshare AO8CH (registre 0x4000),
     * en broadcast (unit id 0) pour ne pas dépendre de l'adresse actuellement configurée.
     */
    public async testSetDeviceAddress(deviceId: string, newAddress: number): Promise<void> {
        const client = await this._connectClient(deviceId, BROADCAST_UNIT_ID);
        try {
            await client.writeRegister(AO8CH_DEVICE_ADDRESS_REGISTER, newAddress);
            this.logger.log({ deviceId, newAddress }, 'waveshare AO8CH device address written (broadcast)');
        } catch (err) {
            this.logger.error({ deviceId, newAddress, err: err.message }, 'valve device address write error');
            throw err;
        } finally {
            client.close(() => this.logger.log({ deviceId }, 'valve modbus connection closed'));
        }
    }

    /**
     * TEST - fait varier pas à pas la sortie 4-20mA d'une voie, de MIN_OUTPUT_MA à MAX_OUTPUT_MA,
     * en réutilisant _writeChannelOutput (mêmes bornes/clamping que la régulation réelle).
     */
    public async testStepOutput(deviceId: string, channel: number, stepMa = 0.1, stepDelayMs = 100): Promise<void> {
        await this._writeChannelOutput(deviceId, channel, 4);
        await this._delay(10000);
        // for (let ma = MIN_OUTPUT_MA; ma <= MAX_OUTPUT_MA; ma += stepMa) {
        //     await this._writeChannelOutput(deviceId, channel, ma);
        //     await this._delay(stepDelayMs);
        // }
        // await this._writeChannelOutput(deviceId, channel, 4);
        // await this._delay(10000);
    }

    private async _writeChannelOutput(deviceId: string, channel: number, milliAmps: number): Promise<void> {
        const client = await this._connectClient(deviceId);
        try {
            const microAmps = this._toClampedMicroAmps(milliAmps);
            const address = AO8CH_CHANNEL_BASE_ADDRESS + (channel - 1);
            await client.writeRegister(address, microAmps);

            this.logger.log({ deviceId, channel, milliAmps, microAmps }, 'waveshare AO8CH channel output written');
        } catch (err) {
            this.logger.error({ deviceId, channel, err: err instanceof Error ? err.message : String(err) }, 'valve output write error');
            const networkCodes = ['EHOSTUNREACH', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'ECONNRESET'];
            if (err.modbusCode !== undefined) return;
            if (!networkCodes.includes(err.code)) throw err;
        } finally {
            client.close(() => this.logger.log({ deviceId, channel }, 'valve modbus connection closed'));
        }
    }
}
