export interface InverterControlRegister {
    address: string;
    alt_address?: string;
    description?: string;
    values?: Record<string, string>;
    unit?: string;
}

export interface InverterMonitoringRegister {
    address: string;
    unit?: string;
    description?: string;
}

export interface InverterParameterItem {
    address: string;
    name: string;
    range?: string;
    default?: string | number;
    change_attribute?: string | null;
    type: string;
}

export interface InverterParameterGroup {
    description: string;
    items: Record<string, InverterParameterItem>;
}

export class InverterModel {
    public id: string;
    public connectionId: string;
    public device: string;
    public source: string;
    public communication: {
        protocol: string; 
        default_baud_rate: number;
        default_slave_address: number;
        default_data_format: string;
        control_registers: Record<string, InverterControlRegister>;
        monitoring_registers: Record<string, InverterMonitoringRegister>;
    };
    public parameters: Record<string, InverterParameterGroup>;
}
