import { Module } from '@nestjs/common';
import { FormulaEngine } from '@register-map/domain/services/formula-engine.service';
import { ModbusBusService } from '@register-map/domain/services/modbus-bus.service';
import { RegisterMapLoader } from '@register-map/domain/services/register-map-loader.service';
import { RegisterMapService } from '@register-map/domain/services/register-map.service';

// Module technique autonome (aucune dépendance à process) : l'appelant construit templates,
// commandes et connexions Modbus depuis ses propres données.
@Module({
    providers: [
        FormulaEngine,
        ModbusBusService,
        RegisterMapLoader,
        RegisterMapService
    ],
    exports: [
        FormulaEngine,
        ModbusBusService,
        RegisterMapLoader,
        RegisterMapService
    ]
})
export class RegisterMapModule { }
