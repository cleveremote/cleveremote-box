export enum ModuleStatus {
    ON = 'ON',
    OFF = 'OFF'
}

export enum ModuleType {
    OUT_NO = 'OUT_NO', // led
    OUT_NC = 'OUT_NC', // led
    IN = 'IN' // button
}

export enum GPIODirection {
    IN = 'in',
    OUT = 'out',
    HIGH = 'high',
    LOW = 'low'
}

export enum GPIOEdge {
    NONE = 'none',
    RISING = 'rising',
    FALLING = 'falling',
    BOTH = 'both'
}