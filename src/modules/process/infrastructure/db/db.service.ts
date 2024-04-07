import { IStructureRepository } from '@process/domain/interfaces/structure-repository.interface';
import { CycleModel } from '../../domain/models/cycle.model';
import { ModuleModel } from '../../domain/models/module.model';
import { SequenceModel } from '../../domain/models/sequence.model';
import { StructureModel } from '../../domain/models/structure.model';
import * as fs from 'fs/promises';
import { StructureEntity } from '../entities/structure.entity';
import { StructureInvalidError } from '@process/domain/errors/structure-invalid.error';
import { Injectable } from '@nestjs/common';
import { Config, JsonDB } from 'node-json-db';

@Injectable()
export class DbService {
    public DB_VALUES: JsonDB;
    public DB_STRUCTURE: JsonDB;

    public async initialize(): Promise<void> {
        await this._initialiseDbStructure();
        await this._initialiseDbValues();
    }

    private async _initialiseDbValues(): Promise<void> {
        this.DB_VALUES = new JsonDB(new Config('DB_VALUES', true, true, '/'));


        if (!await this.DB_VALUES.exists('/sensors')) {
            await this.DB_VALUES.push('/sensors', []);
        }

        if (!await this.DB_VALUES.exists('/cycles')) {
            await this.DB_VALUES.push('/cycles', []);
        }

        if (!await this.DB_VALUES.exists('/sequences')) {
            await this.DB_VALUES.push('/sequences', []);
        }
    }

    private async _initialiseDbStructure(): Promise<void> {
        this.DB_STRUCTURE = new JsonDB(new Config('DB_STRUCTURE', true, true, '/'));

        if (!await this.DB_STRUCTURE.exists('/cycles')) {
            await this.DB_STRUCTURE.push('/cycles', []);
        }
        if (!await this.DB_STRUCTURE.exists('/sensors')) {
            await this.DB_STRUCTURE.push('/sensors', []);
        }
    }

}