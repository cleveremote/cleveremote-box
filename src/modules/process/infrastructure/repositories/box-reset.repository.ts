import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { AuthenticationSchema } from '../schemas/authentication.schema';
import { RecoveryCodeSchema } from '../schemas/recovery-code.schema';
import { VerificationCodeSchema } from '../schemas/verification-code.schema';

// collections du compte : identifiants + codes à usage unique (récupération, vérification)
const ACCOUNT_COLLECTIONS: readonly string[] = [AuthenticationSchema, RecoveryCodeSchema, VerificationCodeSchema]
    .map((schema) => schema.get('collection') as string);

// suppressions physiques (hard) au niveau collection / base, sans passer par les modèles métier
@Injectable()
export class BoxResetRepository {

    public constructor(
        @InjectConnection() private connection: Connection
    ) { }

    // documents supprimés, collections et index (TTL des codes) conservés : pas de redémarrage nécessaire
    public async clearAccount(): Promise<void> {
        for (const name of ACCOUNT_COLLECTIONS) {
            await this.connection.collection(name).deleteMany({});
        }
    }

    // toutes les collections hormis celles du compte ; renvoie les collections supprimées
    public async dropAllExceptAccount(): Promise<string[]> {
        const collections = await this.connection.db.listCollections({}, { nameOnly: true }).toArray();
        const dropped = collections
            .map((collection) => collection.name)
            .filter((name) => !ACCOUNT_COLLECTIONS.includes(name) && !name.startsWith('system.'));
        for (const name of dropped) {
            await this.connection.dropCollection(name);
        }
        return dropped;
    }

    public async dropDatabase(): Promise<void> {
        await this.connection.dropDatabase();
    }
}
