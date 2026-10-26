import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import * as dgram from 'node:dgram';
import { DeviceRepository } from '@process/infrastructure/repositories/device.repository';
import { DeviceModel, DeviceType, MasterConfigModel, MasterProtocol } from '@process/domain/models/device.model';

export interface WaveshareDiscoveryResult {
    ip: string;
    port: number;
    hex: string;
    deviceId?: string;
    name?: string;
}

// requête de découverte Waveshare (170 octets capturés via Wireshark)
const WAVESHARE_DISCOVERY_PAYLOAD = Buffer.from(
    '5a4c00004cf09c7874e919000000000030f09c78f0e762004cf09c787b518f784cf09c78b6980e7a74e91900dce819009d4c8f784cf09c7874e9190074b6450000000000246a6300ece81900fdc29178504e8f7874e91900c5fd8f7874b64500c6aa947874b6450074e919004ce91900710f9378650b93786d0b93781a990e7a6250b300ca50b3000100000060e9190094081f000100000074e91900c0004a00c0004a000000400010e9',
    'hex',
);

/** Erreurs de connexion indiquant que l'IP du master n'est plus joignable (bail DHCP changé) */
export const UNREACHABLE_NETWORK_CODES = ['EHOSTUNREACH', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH'];

@Injectable()
export class WaveshareDiscoveryService {
    // une seule découverte UDP à la fois : les connexions concurrentes en échec la partagent
    private _pendingDiscovery: Promise<WaveshareDiscoveryResult[]> | null = null;

    public constructor(
        @Inject(forwardRef(() => DeviceRepository)) private deviceRepository: DeviceRepository,
        private readonly logger: Logger
    ) { }

    /**
     * Découverte UDP des passerelles Waveshare RS485 TO ETH (B) (protocole VirCom) :
     * réponse entête "ZL" (0x5A 0x4C), device id en [34,40), nom en [41,50).
     */
    public scanNetwork(
        requestPayload: Buffer = WAVESHARE_DISCOVERY_PAYLOAD,
        targetPort = 1092,
        broadcast = '255.255.255.255',
        timeoutMs = 5000,
    ): Promise<WaveshareDiscoveryResult[]> {
        const results = new Map<string, WaveshareDiscoveryResult>();

        return new Promise((resolve, reject) => {
            const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

            socket.on('message', (message, remote) => {
                const result: WaveshareDiscoveryResult = { ip: remote.address, port: remote.port, hex: message.toString('hex') };
                if (message.length >= 50 && message[0] === 0x5A && message[1] === 0x4C) {
                    result.deviceId = message.subarray(34, 40).toString('hex').toUpperCase();
                    result.name = message.subarray(41, 50).toString('ascii').replace(/\0+$/, '');
                }
                results.set(remote.address, result);
                this.logger.log(result, 'waveshare discovery response');
            });

            socket.on('error', (error) => {
                socket.close();
                reject(error);
            });

            socket.bind(0, '0.0.0.0', () => {
                socket.setBroadcast(true);
                socket.send(requestPayload, targetPort, broadcast, (error) => {
                    if (error) {
                        this.logger.error({ err: error }, 'waveshare discovery request failed');
                    } else {
                        this.logger.log(`waveshare discovery request sent to ${broadcast}:${targetPort}`);
                    }
                });
            });

            setTimeout(() => {
                socket.close();
                this.logger.log(`waveshare discovery finished: ${results.size} device(s) found`);
                resolve([...results.values()]);
            }, timeoutMs);
        });
    }

    /**
     * Retrouve la nouvelle IP d'un master TCP via son deviceId Waveshare, met à jour masterConfig
     * en place et la persiste. Renvoie true si l'IP a changé (la connexion peut être retentée).
     */
    public async refreshMasterAddress(masterConfig: MasterConfigModel): Promise<boolean> {
        if (masterConfig.protocol !== MasterProtocol.TCP || !masterConfig.deviceId) return false;

        this._pendingDiscovery ??= this.scanNetwork().finally(() => { this._pendingDiscovery = null; });
        const results = await this._pendingDiscovery;
        const match = results.find((result) => result.deviceId?.toUpperCase() === masterConfig.deviceId.toUpperCase());
        if (!match) {
            this.logger.warn({ deviceId: masterConfig.deviceId }, 'master not found by waveshare discovery');
            return false;
        }
        if (match.ip === masterConfig.ipAddress) return false;

        const previousIp = masterConfig.ipAddress;
        masterConfig.ipAddress = match.ip;

        const master = this._findMasterByDeviceId(await this.deviceRepository.getByType(DeviceType.MASTER), masterConfig.deviceId);
        if (master) {
            (master.config as MasterConfigModel).ipAddress = match.ip;
            await this.deviceRepository.save(master);
        }
        this.logger.log({ masterId: master?._id, deviceId: masterConfig.deviceId, previousIp, ip: match.ip }, 'master ip address updated');
        return true;
    }

    /**
     * Découvre les passerelles Waveshare et les enregistre comme devices MASTER (TCP) :
     * un master déjà connu (même deviceId) voit seulement son IP mise à jour. Renvoie les masters créés.
     */
    public async discover(): Promise<DeviceModel[]> {
        this._pendingDiscovery ??= this.scanNetwork().finally(() => { this._pendingDiscovery = null; });
        const results = (await this._pendingDiscovery).filter((result) => result.deviceId);
        const masters = await this.deviceRepository.getByType(DeviceType.MASTER);
        const created: DeviceModel[] = [];

        for (const result of results) {
            const existing = this._findMasterByDeviceId(masters, result.deviceId);
            if (existing) {
                const config = existing.config as MasterConfigModel;
                if (config.ipAddress !== result.ip) {
                    const previousIp = config.ipAddress;
                    config.ipAddress = result.ip;
                    await this.deviceRepository.save(existing);
                    this.logger.log({ masterId: existing._id, deviceId: result.deviceId, previousIp, ip: result.ip }, 'discovered master ip address updated');
                }
                continue;
            }

            const master = new DeviceModel();
            master.name = result.name || `Waveshare ${result.deviceId}`;
            master.type = DeviceType.MASTER;
            master.description = 'Master découvert automatiquement (Waveshare)';
            // 502 : port Modbus TCP de la passerelle (result.port est le port UDP de découverte)
            master.config = { protocol: MasterProtocol.TCP, ipAddress: result.ip, deviceId: result.deviceId, port: 502, timeout: 1000 };
            const saved = await this.deviceRepository.save(master);
            masters.push(saved);
            created.push(saved);
            this.logger.log({ masterId: saved._id, deviceId: result.deviceId, ip: result.ip }, 'discovered master registered');
        }
        return created;
    }

    private _findMasterByDeviceId(masters: DeviceModel[], deviceId: string): DeviceModel | undefined {
        return masters.find((device) => (device.config as MasterConfigModel).deviceId?.toUpperCase() === deviceId.toUpperCase());
    }
}
