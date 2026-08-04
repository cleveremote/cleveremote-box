import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Connection } from 'mongoose';

// MongoDB ne publie pas de binaire officiel "debian-arm64" : sur une machine ARM64 (ex. la box
// elle-meme), on force le flavor Ubuntu 22.04 arm64 qui existe et reste binaire-compatible.
const MONGO_BINARY_OPTS = process.arch === 'arm64'
    ? { version: '7.0.14', os: { os: 'linux' as const, dist: 'Ubuntu', release: '22.04' } }
    : { version: '7.0.14' };

export async function StartMongoMemory(): Promise<{ mongod: MongoMemoryServer; connection: Connection }> {
    const mongod = await MongoMemoryServer.create({ binary: MONGO_BINARY_OPTS });
    const connection = await mongoose.createConnection(mongod.getUri()).asPromise();
    return { mongod, connection };
}

export async function StopMongoMemory(mongod: MongoMemoryServer, connection: Connection): Promise<void> {
    await connection?.close();
    await mongod?.stop();
}
