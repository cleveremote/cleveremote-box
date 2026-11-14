import { RegisterRawData, RegisterRequest } from './register-map.model';

export enum ModbusTransport {
    TCP = 'TCP',
    RTU = 'RTU'
}

/** Paramètres techniques d'accès à un équipement Modbus (construits par l'appelant) */
export interface ModbusConnection {
    transport: ModbusTransport;
    // TCP
    host?: string;
    port?: number;
    // RTU
    path?: string;
    baudRate?: number;
    // ms, défaut 2000
    timeout?: number;
    // ms de silence imposé sur le bus entre deux transactions (capteurs lents à se remettre à l'écoute), défaut 30
    interFrameDelay?: number;
    // Adresse de l'esclave sur le bus
    unitId: number;
    // TCP injoignable : l'appelant peut fournir une connexion corrigée (ex: IP DHCP retrouvée),
    // retentée une seule fois ; undefined = abandon
    onUnreachable?: () => Promise<ModbusConnection | undefined>;
}

/** Cible d'un scan : même requête envoyée à l'adresse `unitId`, sur la connexion du scan */
export interface ModbusScanTarget {
    unitId: number;
    request: RegisterRequest;
}

export interface ModbusScanResponse extends ModbusScanTarget {
    data: RegisterRawData;
}
