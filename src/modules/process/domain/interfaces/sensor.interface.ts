import { TE } from "nats/lib/nats-base-client/encoders";

export enum SensorType {
    TEMPERATURE = 'T',
    MOISTURE = 'H',
    LOCAL_TEMPERATURE = 'LT',
    LOCAL_HUMIDITY = 'LH',
    LOCAL_PRESSURE = 'LP',
    LOCAL_FLOWMETER = 'LF',
    FORCAST_TEMPERATURE_MAX = 'FTMAX',
    FORCAST_TEMPERATURE_MIN = 'FTMIN',
}
