// Fonctions Modbus (mêmes valeurs que les noms de méthodes modbus-serial), utilisées par les
// trames de test brutes (InitService.testModbusFrame)
export enum ModbusFunctionName {
  READ_COILS = 'readCoils', //01
  READ_DISCRETE_INPUTS = 'readDiscreteInputs', //02
  READ_HOLDING_REGISTERS = 'readHoldingRegisters', //03
  READ_INPUT_REGISTERS = 'readInputRegisters', //04
  WRITE_SINGLE_COIL = 'writeCoil', //05
  WRITE_SINGLE_REGISTER = 'writeRegister', //06
  WRITE_MULTIPLE_COILS = 'writeCoils',//15 (0F hex)
  WRITE_MULTIPLE_REGISTERS = 'writeRegisters',//16 (10 hex)
  CUSTOM_SINGLE_COIL = 'customCoil', //05 avec valeur 0x5500 (non standard, certaines cartes relais)
  CUSTOM_MULTIPLE_COILS = 'customCoils', //05 + 0x5500 répété sur chaque coil (pas d'équivalent FC15)
}
