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
    // Adresse de l'esclave sur le bus
    unitId: number;
    // TCP injoignable : l'appelant peut fournir une connexion corrigée (ex: IP DHCP retrouvée),
    // retentée une seule fois ; undefined = abandon
    onUnreachable?: () => Promise<ModbusConnection | undefined>;
}
