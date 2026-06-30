import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import ModbusRTU from 'modbus-serial';
import { ModbusConnectionRepository } from '@process/infrastructure/repositories/modbusConnection.repository';
import { ModbusConnectionConfigEntity } from '@process/infrastructure/entities/modbusConnetionConfig.entity';
import { ValveConfigModel } from '@process/domain/models/valve.model';

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
export class ValveControlService {

    public constructor(
        private modbusConnectionRepository: ModbusConnectionRepository,
        private readonly logger: Logger
    ) { }

    /**
     * Régule l'ouverture de la vanne proportionnelle jusqu'à atteindre le débit souhaité.
     * Itère : lit le débit mesuré (capteur RS485), corrige l'ouverture (commande proportionnelle)
     * et pilote la vanne 4-20mA via le module Waveshare Modbus RTU Analog Output 8CH,
     * jusqu'à ce que l'écart soit dans la tolérance ou que le nombre d'itérations max soit atteint.
     */
    public async setFlowRate(valve: ValveConfigModel, targetFlowRate: number): Promise<ValveAdjustmentResult> {
        let result: ValveAdjustmentResult;

        for (let iteration = 1; iteration <= valve.maxIterations; iteration++) {
            result = await this._adjustOnce(valve, targetFlowRate, iteration);
            if (result.isStabilized) break;
            await this._delay(valve.iterationDelayMs);
        }

        this.logger.log({ valveId: valve.id, ...result }, 'valve flow rate regulation finished');
        return result;
    }

    private async _adjustOnce(valve: ValveConfigModel, targetFlowRate: number, iteration: number): Promise<ValveAdjustmentResult> {
        const measuredFlowRate = await this._readFlowMeter(valve);
        const error = targetFlowRate - measuredFlowRate;
        const isStabilized = Math.abs(error) <= valve.tolerance;

        if (!isStabilized) {
            valve.openingPercent = Math.min(
                valve.maxOpening,
                Math.max(valve.minOpening, valve.openingPercent + error * valve.kP)
            );
            await this._writeChannelOutput(valve.connectionId, valve.channel, this._openingToMilliAmps(valve.openingPercent));
        }

        const outputCurrentMa = this._openingToMilliAmps(valve.openingPercent);
        this.logger.debug(
            { valveId: valve.id, iteration, targetFlowRate, measuredFlowRate, openingPercent: valve.openingPercent, isStabilized },
            'valve flow rate adjustment step'
        );

        return { targetFlowRate, measuredFlowRate, openingPercent: valve.openingPercent, outputCurrentMa, isStabilized, iterations: iteration };
    }

    private _delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 0% -> 4mA, 100% -> 20mA (live zero, jamais en dessous de MIN_OUTPUT_MA)
    private _openingToMilliAmps(openingPercent: number): number {
        return MIN_OUTPUT_MA + (openingPercent / 100) * (MAX_OUTPUT_MA - MIN_OUTPUT_MA);
    }

    /**
     * FAKE - en attendant la documentation officielle du débitmètre RS485.
     * Simule la lecture Modbus du capteur : le débit suit l'ouverture de la vanne
     * avec un peu de bruit de mesure, pour permettre de tester la boucle de régulation.
     */
    private async _readFlowMeter(valve: ValveConfigModel): Promise<number> {
        const theoreticalFlowRate = (valve.openingPercent / 100) * valve.maxFlowRate;
        const measurementNoise = (Math.random() - 0.5) * 2;
        const measuredFlowRate = Math.max(0, theoreticalFlowRate + measurementNoise);

        this.logger.debug({ flowMeterId: valve.flowMeterId, measuredFlowRate }, 'flow meter read (fake)');
        return measuredFlowRate;
    }

    private async _connectClient(connectionId: string): Promise<ModbusRTU> {
        const connConfig = await this.modbusConnectionRepository.get(connectionId);
        const connConfigModel = ModbusConnectionConfigEntity.mapToModel(connConfig as ModbusConnectionConfigEntity);
        if (!connConfigModel) {
            throw new Error(`No modbus connection config found for connectionId: ${connectionId}`);
        }

        const client = new ModbusRTU();
        if (connConfigModel.protocol === 'tcp') {
            await client.connectTCP(connConfigModel.ipAddress, { port: connConfigModel.port });
        } else if (connConfigModel.protocol === 'rtu') {
            await client.connectRTUBuffered(connConfigModel.path, { baudRate: connConfigModel.baudrate || 9600 });
        } else {
            throw new Error(`Unknown protocol: ${connConfigModel.protocol}`);
        }
        client.setID(connConfigModel.slaveId);
        client.setTimeout(connConfigModel.timeout || 2000);
        return client;
    }

    private async _writeChannelOutput(connectionId: string, channel: number, milliAmps: number): Promise<void> {
        const client = await this._connectClient(connectionId);
        try {
            const clampedMa = Math.min(Math.max(milliAmps, MIN_OUTPUT_MA), MAX_OUTPUT_MA);
            const microAmps = Math.min(Math.max(Math.round(clampedMa * 1000), MIN_OUTPUT_UA), MAX_OUTPUT_UA);
            const address = AO8CH_CHANNEL_BASE_ADDRESS + (channel - 1);
            await client.writeRegister(address, microAmps);

            this.logger.log({ connectionId, channel, milliAmps, microAmps }, 'waveshare AO8CH channel output written');
        } catch (err) {
            this.logger.error({ connectionId, channel, err: err.message }, 'valve output write error');
            const networkCodes = ['EHOSTUNREACH', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'ECONNRESET'];
            if (err.modbusCode !== undefined) return;
            if (!networkCodes.includes(err.code)) throw err;
        } finally {
            client.close(() => this.logger.log({ connectionId, channel }, 'valve modbus connection closed'));
        }
    }

}
