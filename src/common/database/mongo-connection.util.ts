import { Logger } from '@nestjs/common';
import { ConnectOptions, Connection, ConnectionStates } from 'mongoose';

const logger = new Logger('MongoDB');

// Utilise en connectionFactory avec `lazyConnection: true` : l'app demarre sans attendre Mongo.
// mongoose ne retente pas une connexion initiale echouee (le driver ne gere que les reconnexions
// apres un premier succes), on relance donc nous-memes openUri jusqu'a ce que la base reponde.
export function watchMongoConnection(
    connection: Connection,
    uri: string,
    options: ConnectOptions = {},
    retryDelayMs = 10000
): Connection {
    let wasConnected = false;

    const retry = (error: unknown): void => {
        logger.warn(`MongoDB indisponible (${String((error as Error)?.message ?? error)}), nouvel essai dans ${retryDelayMs / 1000}s`);
        setTimeout(() => {
            if (connection.readyState === ConnectionStates.connected || connection.readyState === ConnectionStates.connecting) {
                return;
            }
            connection.openUri(uri, options).catch(retry);
        }, retryDelayMs);
    };

    connection.on('connected', () => {
        wasConnected = true;
        logger.log('MongoDB connecte');
    });
    connection.on('disconnected', () => {
        if (wasConnected) {
            logger.warn('MongoDB deconnecte');
        }
    });
    // sans listener, un evenement 'error' emis par la connexion ferait tomber le process ;
    // les echecs de connexion initiale sont deja logges par retry()
    connection.on('error', (error) => {
        if (wasConnected) {
            logger.error(`MongoDB erreur : ${String(error?.message ?? error)}`);
        }
    });

    connection.asPromise().catch(retry);
    return connection;
}
