import * as fs from 'fs/promises';
import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { Config, JsonDB } from 'node-json-db';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DbService {
    public DB_STRUCTURE: JsonDB;

    constructor(
        private _config: ConfigService,
        private readonly logger: Logger
    ) {

    }
    public async initialize(): Promise<void> {
        this.createFolders();
    }

    private createFolders(): void {
        try {
            fs.mkdir(`${this._config.get('DB_PATH')}/backup`, { recursive: true });
        } catch (error) {
            this.logger.error({ error }, 'DB folders could not be created');
        }
    }

    private async _initialiseDbStructure(): Promise<void> {
        try {
            this.logger.log({ dbPath: this._config.get('DB_PATH') }, 'initializing DB_STRUCTURE');
            this.DB_STRUCTURE = new JsonDB(new Config(`${this._config.get('DB_PATH')}/DB_STRUCTURE`, true, true, '/'));

            if (!await this.DB_STRUCTURE.exists('/cycles')) {
                await this.DB_STRUCTURE.push('/cycles', []);
            }
            if (!await this.DB_STRUCTURE.exists('/sensors')) {
                await this.DB_STRUCTURE.push('/sensors', []);
            }
            if (!await this.DB_STRUCTURE.exists('/modbusConnections')) {
                await this.DB_STRUCTURE.push('/modbusConnections', []);
            }
            if (!await this.DB_STRUCTURE.exists('/modbusTasks')) {
                await this.DB_STRUCTURE.push('/modbusTasks', []);
            }
            if (!await this.DB_STRUCTURE.exists('/valves')) {
                await this.DB_STRUCTURE.push('/valves', []);
            }

        } catch (error) {
            this.logger.error({ error }, 'DB_STRUCTURE could not be loaded, restoring from backup');
            await this.executeBackUp('DB_STRUCTURE', 'RESTORE');
        }
    }

    public async executeBackUp(type: string, action: string = 'SAVE'): Promise<void> {
        try {
            await fs.copyFile(`${action === 'RESTORE' ? `${this._config.get('DB_PATH')}/backup/` : `${this._config.get('DB_PATH')}/`}${type}${action === 'RESTORE' ? '-backup' : ''}.json`,
                `${action === 'RESTORE' ? `${this._config.get('DB_PATH')}/` : `${this._config.get('DB_PATH')}/backup/`}${type}${action === 'RESTORE' ? '' : '-backup'}.json`);
        } catch (error) {
            this.logger.error({ error, type, action }, `DB ${type} could not be ${action.toLowerCase()}d`);
        }
    } 

}