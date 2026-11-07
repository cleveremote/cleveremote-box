import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RegisterMapModule } from '@register-map/infrastructure/register-map.module';
import { SimulatorService } from '@simulator/domain/services/simulator.service';

// Équipements Modbus simulés derrière une passerelle TCP locale (inactif sans SIMULATOR_ENABLED=true)
@Module({
    imports: [ConfigModule, RegisterMapModule],
    providers: [SimulatorService]
})
export class SimulatorModule { }
