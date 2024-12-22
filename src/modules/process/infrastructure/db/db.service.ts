import * as fs from 'fs/promises';
import { Injectable } from '@nestjs/common';
import { Config, JsonDB } from 'node-json-db';

@Injectable()
export class DbService {
    public DB_VALUES: JsonDB;
    public DB_STRUCTURE: JsonDB;
    public DB_AUTH: JsonDB;
    public DB_SENSOR_VALUE = {};


    public async initialize(): Promise<void> {
        await this._initialiseDbAuth();
        await this._initialiseDbStructure();
        await this._initialiseDbValues();
        await this._initialiseDbSensorData();
        
    }

    private async _initialiseDbValues(): Promise<void> {
        try {
            this.DB_VALUES = new JsonDB(new Config('db/DB_VALUES', true, true, '/'));

            if (!await this.DB_VALUES.exists('/sensors')) {
                await this.DB_VALUES.push('/sensors', []);
            }

            if (!await this.DB_VALUES.exists('/processes')) {
                await this.DB_VALUES.push('/processes', []);
            }
        } catch (error) {
            console.error('The database DB_VALUES could not be loaded');
            await this.executeBackUp('DB_VALUES', 'RESTORE');
            if (!await this.DB_VALUES.exists('/sensors')) {
                await this.DB_VALUES.push('/sensors', []);
            }

            if (!await this.DB_VALUES.exists('/processes')) {
                await this.DB_VALUES.push('/processes', []);
            }
        }
    }

    private async _initialiseDbAuth(): Promise<void> {
        try {
            this.DB_AUTH = new JsonDB(new Config('db/DB_AUTH', true, true, '/'));
        } catch (error) {
            console.error('The database DB_AUTH could not be loaded');
            await this.executeBackUp('DB_AUTH', 'RESTORE');
        }
    }

    private async _initialiseDbSensorData(): Promise<void> {
        try {
            const key = `${(new Date()).getMonth()}-${(new Date()).getFullYear()}`
            this.DB_SENSOR_VALUE[key] = new JsonDB(new Config(`data_in/sensor/${key}`, true, false, '/'));
            if (!await this.DB_SENSOR_VALUE[key].exists('/data')) {
                await this.DB_SENSOR_VALUE[key].push('/data', []);
            }
            let numberOfElements = await this.DB_SENSOR_VALUE[key].count("/data");
        } catch (error) {
            console.error('The database DB_AUTH could not be loaded');
            await this.executeBackUp('DB_AUTH', 'RESTORE');
        }
    }

    private async _initialiseDbStructure(): Promise<void> {
        try {
            this.DB_STRUCTURE = new JsonDB(new Config('db/DB_STRUCTURE', true, true, '/'));

            if (!await this.DB_STRUCTURE.exists('/cycles')) {
                await this.DB_STRUCTURE.push('/cycles', []);
            }
            if (!await this.DB_STRUCTURE.exists('/sensors')) {
                await this.DB_STRUCTURE.push('/sensors', []);
            }
        } catch (error) {
            console.error('The file could not be copied');
            await this.executeBackUp('DB_STRUCTURE', 'RESTORE');
        }
    }

    public async executeBackUp(type: string, action: string = 'SAVE'): Promise<void> {
        try {
            await fs.copyFile(`${action === 'RESTORE' ? 'db/backup/' : 'db/'}${type}${action === 'RESTORE' ? '-backup' : ''}.json`,
                `${action === 'RESTORE' ? 'db/' : 'db/backup/'}${type}${action === 'RESTORE' ? '' : '-backup'}.json`);
        } catch {
            console.error(`·the database ${type} could not be ${action.toLowerCase()}d`);
        }
    }

}