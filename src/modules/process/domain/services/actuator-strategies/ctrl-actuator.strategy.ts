import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import ModbusRTU from 'modbus-serial';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { DeviceModel, MasterConfigModel, MasterProtocol, SlaveConfigModel } from '@process/domain/models/device.model';
import { ActuatorActionConfig, ActuatorModel, CtrlActuatorConfigModel } from '@process/domain/models/actuator.model';
import { ActuatorType } from '../../interfaces/actuator-module.interface';
import { ActuatorStrategy } from './actuator-strategy.interface';
import { ModbusService } from '../modbus.service';
import { ComRequestRepository } from '@process/infrastructure/repositories/com-request.repository';
import { ComRequestConfigModel, ComRequestModel } from '@process/domain/models/com-request.model';
import { buildOverrideParams } from '@process/domain/utils/build-override-params.util';
import { AO8CH_DEVICE_ADDRESS_REGISTER, BROADCAST_UNIT_ID } from '@process/domain/utils/modbus-registers.util';

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

export interface ValveAdjustmentResult {
    targetFlowRate: number;
    measuredFlowRate: number;
    openingPercent: number;
    outputCurrentMa: number;
    isStabilized: boolean;
    iterations: number;
}

@Injectable()
export class CtrlActuatorStrategy implements ActuatorStrategy {
    public readonly type = ActuatorType.CTRL;

    public constructor(
        private deviceRepository: DeviceRepository,
        private comRequestRepository: ComRequestRepository,
        private modbusService: ModbusService,
        private readonly logger: Logger
    ) { }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async configure(actuator: ActuatorModel): Promise<void> {
        // rien a configurer cote box : les connexions Modbus sont ouvertes/fermees a chaque
        // ecriture (cf. _connectClient / _writeChannelOutput), pas de handle a preparer en amont.
    }

    /**
     * Point d'entree ActuatorStrategy : `action` est la valeur de débit cible à atteindre
     * (pas un simple 0/1 comme pour RPI/COM). Délègue à setFlowRate() et ignore le résultat
     * détaillé (ValveAdjustmentResult), déjà loggé par setFlowRate.
     */
    public async execute(actuator: ActuatorModel, action: number): Promise<void> {
        await this.setFlowRate(actuator as ValveActuatorModel, action);
    }

    public read(actuator: ActuatorModel): number {
        return (actuator.config as CtrlActuatorConfigModel).openingPercent;
    }

    /**
     * Régule l'ouverture de la vanne proportionnelle jusqu'à atteindre le débit souhaité.
     * Itère : lit le débit mesuré (capteur RS485), corrige l'ouverture (commande proportionnelle)
     * et pilote la vanne 4-20mA via le module Waveshare Modbus RTU Analog Output 8CH,
     * jusqu'à ce que l'écart soit dans la tolérance ou que le nombre d'itérations max soit atteint.
     */
    public async setFlowRate(valve: ValveActuatorModel, targetFlowRate: number): Promise<ValveAdjustmentResult> {
        let result: ValveAdjustmentResult;

        for (let iteration = 1; iteration <= valve.config.maxIterations; iteration++) {
            const openingBeforeAdjust = valve.config.openingPercent;
            result = await this._adjustOnce(valve, targetFlowRate, iteration);
            if (result.isStabilized) break;
            // en plus du delai de boucle, on attend le temps que met physiquement la vanne a
            // atteindre sa nouvelle position (cf. _positioningDelayMs) avant de relire le debit.
            const positioningDelayMs = this._positioningDelayMs(valve, valve.config.openingPercent - openingBeforeAdjust);
            await this._delay(valve.config.iterationDelayMs + positioningDelayMs);
        }

        this.logger.log({ valveId: valve._id, ...result }, 'valve flow rate regulation finished');
        return result;
    }

    private async _adjustOnce(valve: ValveActuatorModel, targetFlowRate: number, iteration: number): Promise<ValveAdjustmentResult> {
        const measuredFlowRate = await this._readFlowMeterTest(valve, iteration);
        const error = targetFlowRate - measuredFlowRate;
        const isStabilized = Math.abs(error) <= valve.config.tolerance;

        if (!isStabilized) {
            valve.config.openingPercent = Math.min(
                valve.config.maxOpening,
                Math.max(valve.config.minOpening, valve.config.openingPercent + error * (valve.config.kP / 10))
            );
            await this._writeOpeningViaComRequest(valve.config.actions[0], this._openingToMilliAmps(valve.config.openingPercent));
        }

        const outputCurrentMa = this._openingToMilliAmps(valve.config.openingPercent);
        this.logger.debug(
            { valveId: valve._id, iteration, targetFlowRate, measuredFlowRate, openingPercent: valve.config.openingPercent, isStabilized },
            'valve flow rate adjustment step'
        );

        return { targetFlowRate, measuredFlowRate, openingPercent: valve.config.openingPercent, outputCurrentMa, isStabilized, iterations: iteration };
    }

    private _delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // temps physique estime pour que la vanne rejoigne sa nouvelle position : course complete
    // (minOpening <-> maxOpening) en config.fullStrokeMs, proportionnellement moins pour un
    // deplacement partiel.
    private _positioningDelayMs(valve: ValveActuatorModel, openingDeltaPercent: number): number {
        const fullRange = valve.config.maxOpening - valve.config.minOpening;
        if (fullRange <= 0) return 0;
        return (Math.abs(openingDeltaPercent) / fullRange) * valve.config.fullStrokeMs;
    }

    // 0% -> 4mA, 100% -> 20mA (live zero, jamais en dessous de MIN_OUTPUT_MA)
    private _openingToMilliAmps(openingPercent: number): number {
        return MIN_OUTPUT_MA + (openingPercent / 100) * (MAX_OUTPUT_MA - MIN_OUTPUT_MA);
    }

    private _toClampedMicroAmps(milliAmps: number): number {
        const clampedMa = Math.min(Math.max(milliAmps, MIN_OUTPUT_MA), MAX_OUTPUT_MA);
        return Math.min(Math.max(Math.round(clampedMa * 1000), MIN_OUTPUT_UA), MAX_OUTPUT_UA);
    }

    // route l'ecriture via ModbusTaskService (meme chemin que ComActuatorStrategy.execute) plutot
    // que via une connexion modbus-serial geree a la main : beneficie de la file d'attente
    // partagee (_enqueue) qui serialise les acces au bus RS485, et de la gestion
    // connexion/erreurs deja centralisee dans ModbusTaskService._runComRequest.
    private async _writeOpeningViaComRequest(action: ActuatorActionConfig, milliAmps: number): Promise<void> {
        const microAmps = this._toClampedMicroAmps(milliAmps); 
        const comRequest: ComRequestModel = await this.comRequestRepository.get(action.comRequestId) as ComRequestModel;


        const comRequestData: ComRequestModel = await this.comRequestRepository.get(action.comRequestId) as ComRequestModel;
        const overrideParams: ComRequestConfigModel = { address: action.portNumber, params: { value: microAmps } }
        this.modbusService.execute(comRequestData, buildOverrideParams(comRequestData.config, overrideParams));
    } 

    /**
     * FAKE - en attendant la documentation officielle du débitmètre RS485.
     * Simule la lecture Modbus du capteur : le débit suit l'ouverture de la vanne avec un peu de
     * bruit de mesure. Lue seulement après que setFlowRate ait attendu _positioningDelayMs, donc
     * openingPercent reflete deja la position physique reelle de la vanne a cet instant.
     */
    private async _readFlowMeter(valve: ValveActuatorModel): Promise<number> {
        const theoreticalFlowRate = (valve.config.openingPercent / 100) * valve.config.maxFlowRate;
        const measurementNoise = (Math.random() - 0.5) * 2;
        const measuredFlowRate = Math.max(0, theoreticalFlowRate + measurementNoise);

        this.logger.debug({ flowMeterId: valve.config.flowMeterId, measuredFlowRate }, 'flow meter read (fake)');
        return measuredFlowRate;
    }

    private async _readFlowMeterTest(valve: ValveActuatorModel, iteration: number): Promise<number> {

        return iteration * 10;


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
            await client.connectTCP(masterConfig.ipAddress, { port: masterConfig.port });
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
            this.logger.error({ deviceId, channel, err: err.message }, 'valve output write error');
            const networkCodes = ['EHOSTUNREACH', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'ECONNRESET'];
            if (err.modbusCode !== undefined) return;
            if (!networkCodes.includes(err.code)) throw err; 
        } finally {
            client.close(() => this.logger.log({ deviceId, channel }, 'valve modbus connection closed'));
        }
    }
}
