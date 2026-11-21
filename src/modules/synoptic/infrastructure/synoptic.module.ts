import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActuatorModule } from '@process/domain/services/actuator-strategies/actuator.module';
import { SynopticService } from '@synoptic/domain/services/synoptic.service';
import { SynopticController } from './controllers/synoptic.controller';
import { SynopticRepository } from './repositories/synoptic.repository';
import { Synoptic, SynopticSchema } from './schemas/synoptic.schema';

// Synoptiques SVG : import (svgson), stockage et affectations des elements. La supervision reutilise les
// flux existants (box/fetch/status, agg/synchronize/*) : aucun envoi de valeurs propre a ce module.
// ActuatorModule : repositories sensors / cycles pour verifier les cibles des affectations.
@Module({
    imports: [
        MongooseModule.forFeature([{ name: Synoptic.name, schema: SynopticSchema }]),
        ActuatorModule
    ],
    controllers: [SynopticController],
    providers: [SynopticRepository, SynopticService]
})
export class SynopticModule { }
