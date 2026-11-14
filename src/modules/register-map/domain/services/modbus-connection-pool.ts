import { Logger } from 'nestjs-pino';
import ModbusRTU from 'modbus-serial';
import { ModbusConnection, ModbusTransport } from '../models/modbus-connection.model';

// Erreur levée par modbus-serial quand la connexion est fermée : la requête n'a pas été émise
const PORT_NOT_OPEN_ERROR = 'PortNotOpenError';
const DEFAULT_TIMEOUT = 2000;
// Connexion fermée après ce délai sans transaction (libère la place sur la passerelle)
const IDLE_CLOSE_MS = 30000;
// Sur un socket déjà mort, modbus-serial n'appelle jamais le callback de close() : attente bornée
const CLOSE_TIMEOUT = 1000;

interface PooledConnection {
    client: ModbusRTU;
    idleTimer?: NodeJS.Timeout;
}

/** Passerelle jointe par `connection` (hôte:port TCP ou port série), commune à tous les slaves derrière elle */
export function ModbusGatewayKey(connection: ModbusConnection): string {
    return connection.transport === ModbusTransport.RTU
        ? `${connection.transport}:${connection.path}`
        : `${connection.transport}:${connection.host}:${connection.port}`;
}

/**
 * Une connexion par passerelle (hôte:port TCP ou port série), partagée par tous les slaves derrière elle,
 * gardée ouverte entre deux transactions et rouverte automatiquement quand elle est perdue.
 * Appelée uniquement depuis la file du bus (ModbusBusService.runExclusive), à laquelle elle soumet aussi
 * ses fermetures sur inactivité.
 */
export class ModbusConnectionPool {
    private readonly _connections = new Map<string, PooledConnection>();

    public constructor(
        private readonly connect: (client: ModbusRTU, connection: ModbusConnection) => Promise<void>,
        private readonly runExclusive: (run: () => Promise<void>) => Promise<void>,
        private readonly logger: Logger
    ) { }

    /**
     * Transaction sur la connexion de la passerelle. Exception Modbus : la liaison va bien, connexion gardée. Autre erreur
     * (timeout, socket) : connexion fermée, la transaction suivante la rouvre ; non rejouée (une écriture a pu passer,
     * un slave muet ne doit pas bloquer la file deux fois). PortNotOpenError : rien n'a été émis, rejouée une fois.
     */
    public async withClient<T>(connection: ModbusConnection, run: (client: ModbusRTU) => Promise<T>, isRetry = false): Promise<T> {
        const key = this._key(connection);
        const pooled = await this._acquire(key, connection);
        pooled.client.setID(connection.unitId);
        pooled.client.setTimeout(connection.timeout || DEFAULT_TIMEOUT);
        try {
            return await run(pooled.client);
        } catch (err) {
            if (this._isModbusException(err)) {
                throw err;
            }
            await this._evict(key);
            if (!isRetry && this._isPortNotOpen(err)) {
                this.logger.warn({ key }, 'modbus connection lost, reconnecting');
                return this.withClient(connection, run, true);
            }
            throw err;
        } finally {
            this._armIdleClose(key);
        }
    }

    /** Ferme la connexion de la passerelle de `connection`, s'il y en a une */
    public evict(connection: ModbusConnection): Promise<void> {
        return this._evict(this._key(connection));
    }

    public async closeAll(): Promise<void> {
        await Promise.all([...this._connections.keys()].map((key) => this._evict(key)));
    }

    private async _acquire(key: string, connection: ModbusConnection): Promise<PooledConnection> {
        const existing = this._connections.get(key);
        if (existing?.client.isOpen) {
            return existing;
        }
        await this._evict(key);
        const client = new ModbusRTU();
        await this.connect(client, connection);
        const pooled: PooledConnection = { client };
        // Fermeture côté passerelle (redémarrage, idle timeout...) : retirée du pool, la transaction suivante rouvre.
        // Sans écouteur 'error', une erreur socket émise par modbus-serial ferait planter le process.
        client.on('close', () => this._forget(key, pooled, 'pooled modbus connection closed'));
        client.on('error', (err) => {
            this.logger.warn({ key, err: (err as { message?: string })?.message }, 'pooled modbus connection error');
            this._forget(key, pooled);
            void this._close(client);
        });
        this._connections.set(key, pooled);
        this.logger.debug({ key }, 'pooled modbus connection opened');
        return pooled;
    }

    // Retire `pooled` du pool s'il y est encore (une nouvelle connexion a pu le remplacer sous la même clé)
    private _forget(key: string, pooled: PooledConnection, message?: string): void {
        if (this._connections.get(key) !== pooled) {
            return;
        }
        clearTimeout(pooled.idleTimer);
        this._connections.delete(key);
        if (message) {
            this.logger.debug({ key }, message);
        }
    }

    private async _evict(key: string): Promise<void> {
        const pooled = this._connections.get(key);
        if (!pooled) {
            return;
        }
        this._forget(key, pooled);
        await this._close(pooled.client);
    }

    private _close(client: ModbusRTU): Promise<void> {
        return new Promise((resolve) => {
            const timer = setTimeout(resolve, CLOSE_TIMEOUT);
            client.close(() => {
                clearTimeout(timer);
                resolve();
            });
        });
    }

    // Fermeture passée par la file : jamais au milieu d'une transaction
    private _armIdleClose(key: string): void {
        const pooled = this._connections.get(key);
        if (!pooled) {
            return;
        }
        clearTimeout(pooled.idleTimer);
        pooled.idleTimer = setTimeout(() => {
            void this.runExclusive(async () => {
                if (this._connections.get(key) === pooled) {
                    await this._evict(key);
                    this.logger.debug({ key }, 'idle modbus connection closed');
                }
            });
        }, IDLE_CLOSE_MS);
        // ne retient pas le process (arrêt, tests)
        pooled.idleTimer.unref?.();
    }

    private _key(connection: ModbusConnection): string {
        return ModbusGatewayKey(connection);
    }

    private _isPortNotOpen(err: unknown): boolean {
        return (err as { name?: string })?.name === PORT_NOT_OPEN_ERROR;
    }

    private _isModbusException(err: unknown): boolean {
        return typeof (err as { modbusCode?: unknown })?.modbusCode === 'number';
    }
}
