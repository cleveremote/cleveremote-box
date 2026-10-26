import { BadRequestException, Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { ModbusConnection, ModbusTransport } from '@register-map/domain/models/modbus-connection.model';
import { RegisterFunction } from '@register-map/domain/models/register-map.model';
import { ModbusBusService } from '@register-map/domain/services/modbus-bus.service';
import { DEVICE_KIND_SPECS, DeviceModel, getDeviceKindByAddress, MasterConfigModel, MasterProtocol, SlaveConfigModel } from '../models/device.model';
import { DEFAULT_UNCONFIGURED_UNIT_ID } from '../utils/modbus-registers.util';
import { WaveshareDiscoveryService } from './waveshare-discovery.service';

// Timeout court des sondes de découverte : ne pas bloquer la file du bus quand rien ne répond (cas nominal)
const DISCOVERY_TIMEOUT = 200;
// Registre d'adresse par défaut des modules Waveshare
const DEFAULT_DISCOVERY_REGISTER = 0x4000;

/**
 * Opérations Modbus liées aux devices (adressage des slaves, découverte) : traduit masters/slaves
 * en connexions et délègue l'exécution au ModbusBusService du module register-map.
 */
@Injectable()
export class ModbusDeviceService {

    public constructor(
        private readonly modbusBus: ModbusBusService,
        private readonly waveshareDiscoveryService: WaveshareDiscoveryService,
        private readonly logger: Logger
    ) { }

    /** Connexion vers `unitId` derrière ce master */
    public toConnection(masterConfig: MasterConfigModel, unitId: number): ModbusConnection {
        const connection: ModbusConnection = masterConfig.protocol === MasterProtocol.RTU
            ? { transport: ModbusTransport.RTU, path: masterConfig.path, baudRate: masterConfig.baudRate, unitId }
            : { transport: ModbusTransport.TCP, host: masterConfig.ipAddress, port: masterConfig.port, unitId };
        connection.timeout = masterConfig.timeout;
        // IP obsolète (master en DHCP) : retrouvée par son deviceId Waveshare, masterConfig mis à jour en place
        connection.onUnreachable = async (): Promise<ModbusConnection | undefined> => {
            const isRefreshed = await this.waveshareDiscoveryService.refreshMasterAddress(masterConfig);
            return isRefreshed ? this.toConnection(masterConfig, unitId) : undefined;
        };
        return connection;
    }

    /** Écrit `newAddress` dans le registre d'adresse du slave joignable à `currentAddress` (FC06, 1 à 255) */
    public async setSlaveAddress(master: DeviceModel, slaveAddressRegister: number, currentAddress: number, newAddress: number): Promise<void> {
        if (newAddress < 1 || newAddress > 255) {
            throw new BadRequestException('Adresse : 1 à 255');
        }
        const connection = this.toConnection(master.config as MasterConfigModel, currentAddress);
        await this.modbusBus.execute(connection, {
            function: RegisterFunction.WRITE_SINGLE_REGISTER, address: slaveAddressRegister, length: 1, value: newAddress
        });
        this.logger.log({ deviceId: master._id, currentAddress, newAddress }, 'slave address changed');
    }

    /**
     * Remet un slave sur l'adresse d'origine de sa plage (DEVICE_KIND_SPECS[kind].range.min,
     * reservee aux modules neufs) pour qu'il soit de nouveau decouvrable. Le type est deduit de
     * l'adresse courante (ex 62 -> DIGITAL_IO -> 61). Sans type/registre de decouverte, ou deja
     * sur l'adresse min, rien a faire.
     */
    public async resetSlaveAddress(slave: DeviceModel, master: DeviceModel): Promise<void> {
        const currentAddress = (slave.config as SlaveConfigModel).slaveId;
        const kind = getDeviceKindByAddress(currentAddress);
        const spec = kind ? DEVICE_KIND_SPECS[kind] : undefined;
        const register = spec?.discoveryRegister;
        if (!spec || register === undefined) {
            this.logger.warn({ deviceId: slave._id, currentAddress }, 'slave address reset skipped: no discovery register for its range');
            return;
        }
        const originAddress = spec.range.min;
        if (currentAddress === originAddress) {
            return;
        }
        await this.setSlaveAddress(master, register, currentAddress, originAddress);
    }

    /**
     * Un cycle de sonde de découverte pour ce master : lit chaque registre de discoveryRegisters sur
     * DEFAULT_UNCONFIGURED_UNIT_ID et renvoie le premier qui répond (null sinon). Aucune récurrence :
     * c'est le watch loop de DeviceService qui rappelle cette méthode.
     */
    public async probeMasterForNewSlave(master: DeviceModel): Promise<number | null> {
        const masterConfig = master.config as MasterConfigModel;
        const registers = masterConfig.discoveryRegisters ?? [DEFAULT_DISCOVERY_REGISTER];
        const targets = registers.map((register) => ({ unitId: DEFAULT_UNCONFIGURED_UNIT_ID, register }));
        const [detected] = await this.scanDiscoveryRegisters(master, targets);
        if (!detected) {
            return null;
        }
        this.logger.log({ masterId: master._id, register: detected.register }, 'new unconfigured modbus slave detected');
        return detected.register;
    }

    /** Lit, sur une seule connexion au master, le registre de chaque cible ; ne renvoie que les cibles qui ont répondu */
    public async scanDiscoveryRegisters(
        master: DeviceModel,
        targets: { unitId: number; register: number }[]
    ): Promise<{ unitId: number; register: number; value: number }[]> {
        const connection = { ...this.toConnection(master.config as MasterConfigModel, DEFAULT_UNCONFIGURED_UNIT_ID), timeout: DISCOVERY_TIMEOUT };
        const scanTargets = targets.map(({ unitId, register }) => ({
            unitId, request: { function: RegisterFunction.READ_HOLDING_REGISTERS, address: register, length: 1 }
        }));
        try {
            const responses = await this.modbusBus.scan(connection, scanTargets);
            return responses.map(({ unitId, request, data }) => ({ unitId, register: request.address, value: Number((data || [])[0]) }));
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.warn({ masterId: master._id, err: message }, 'discovery scan connection failed');
            return [];
        }
    }
}
