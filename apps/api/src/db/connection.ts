import mongoose from 'mongoose';
import { env } from '../config/env';

let connectionPromise: Promise<typeof mongoose> | null = null;
let listenersAttached = false;

export type DatabaseConnectionInfo = {
  reused: boolean;
  waitedForExistingConnection: boolean;
  elapsedMs: number;
  readyState: number;
  host?: string;
};

const databaseOptions = {
  // Serverless functions may scale horizontally. Keep each instance pool small so a
  // short request burst does not create an unnecessarily large number of Atlas sockets.
  maxPoolSize: 5,
  minPoolSize: 0,
  maxIdleTimeMS: 60_000,

  // Vercel currently terminates this API after 30s. Fail well before that so transient
  // Atlas/network problems become controlled 503 responses instead of opaque 504s.
  serverSelectionTimeoutMS: 5_000,
  connectTimeoutMS: 5_000,
  waitQueueTimeoutMS: 5_000,
  socketTimeoutMS: 15_000,

  // Never queue Mongoose operations while there is no usable connection. Buffering can
  // otherwise hide a broken connection until the platform function timeout is reached.
  bufferCommands: false,
} as const;

function attachConnectionListeners(): void {
  if (listenersAttached) return;
  listenersAttached = true;
  mongoose.connection.on('error', (error) => console.error('MongoDB connection error:', error));
  mongoose.connection.on('disconnected', () => {
    // A successfully resolved connection promise must never prevent a later reconnect.
    connectionPromise = null;
    console.warn('MongoDB disconnected');
  });
  mongoose.connection.on('reconnected', () => console.info(`MongoDB reconnected: ${mongoose.connection.host}`));
  mongoose.connection.once('connected', () => console.info(`MongoDB connected: ${mongoose.connection.host}`));
}

export function isDatabaseUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = String((error as { name?: unknown }).name ?? '');
  return [
    'MongoServerSelectionError',
    'MongooseServerSelectionError',
    'MongoNetworkError',
    'MongoNetworkTimeoutError',
    'MongoTopologyClosedError',
  ].includes(name);
}

async function waitForConnectionAlreadyOpening(): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      mongoose.connection.asPromise().then(() => undefined),
      new Promise<void>((_, reject) => {
        timeout = setTimeout(() => reject(Object.assign(new Error('MongoDB connection attempt timed out'), { name: 'MongooseServerSelectionError' })), 5_000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function connectDatabase(): Promise<DatabaseConnectionInfo> {
  const startedAt = Date.now();
  attachConnectionListeners();

  if (mongoose.connection.readyState === 1) {
    return {
      reused: true,
      waitedForExistingConnection: false,
      elapsedMs: Date.now() - startedAt,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
    };
  }

  const waitedForExistingConnection = Boolean(connectionPromise) || mongoose.connection.readyState === 2;

  if (connectionPromise) {
    await connectionPromise;
  } else if (mongoose.connection.readyState === 2) {
    // This can happen if the Mongo driver is already reconnecting internally. Do not
    // start a second openUri() call against the same Mongoose connection.
    await waitForConnectionAlreadyOpening();
  } else {
    const attempt = mongoose.connect(env.MONGODB_URI, databaseOptions);
    connectionPromise = attempt;
    try {
      await attempt;
    } catch (error) {
      throw error;
    } finally {
      // Keep only in-flight connection attempts. Once an attempt settles, readyState is
      // the source of truth; if the socket is lost later a future request can reconnect.
      if (connectionPromise === attempt) connectionPromise = null;
    }
  }

  if (mongoose.connection.readyState !== 1) {
    throw Object.assign(new Error(`MongoDB is not connected (readyState=${mongoose.connection.readyState})`), { name: 'MongooseServerSelectionError' });
  }

  return {
    reused: waitedForExistingConnection,
    waitedForExistingConnection,
    elapsedMs: Date.now() - startedAt,
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
  };
}

export async function pingDatabase(): Promise<number> {
  const startedAt = Date.now();
  await connectDatabase();
  if (!mongoose.connection.db) throw new Error('MongoDB database handle is unavailable');
  await mongoose.connection.db.admin().command({ ping: 1 });
  return Date.now() - startedAt;
}

export async function disconnectDatabase(): Promise<void> {
  connectionPromise = null;
  await mongoose.disconnect();
}
