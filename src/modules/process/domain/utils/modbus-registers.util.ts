// Waveshare "Modbus RTU Analog Output 8CH" (AO8CH) - registre d'adresse esclave
// (0x0001-0x00FF). Partage par ctrl-actuator.strategy.ts (commissioning manuel) et
// ModbusService (decouverte/provisioning automatique de nouveaux modules).
export const AO8CH_DEVICE_ADDRESS_REGISTER = 0x4000;

// Adresse d'usine/non configuree du module AO8CH : c'est l'unit id auquel un module
// neuf repond tant que son adresse esclave n'a pas encore ete ecrite.
export const DEFAULT_UNCONFIGURED_UNIT_ID = 1;

// Adresse de diffusion (unit id 0) : le module AO8CH repond meme en broadcast, ce qui
// permet de (re)configurer son adresse sans connaitre l'adresse actuelle - utile en
// commissionning tant qu'un seul module AO8CH est present sur le bus.
export const BROADCAST_UNIT_ID = 0;
