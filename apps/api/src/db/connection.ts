import mongoose from 'mongoose';
import { env } from '../config/env';
import { dropLegacyUniqueEmailIndex } from '../modules/users/user.model';

let connectionPromise: Promise<typeof mongoose> | null = null;

export async function connectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  if (connectionPromise) {
    await connectionPromise;
    return;
  }
  mongoose.connection.on('error', (error) => console.error('MongoDB connection error:', error));
  mongoose.connection.once('connected', () => console.info(`MongoDB connected: ${mongoose.connection.host}`));
  connectionPromise = mongoose.connect(env.MONGODB_URI, { maxPoolSize: 10 });
  await connectionPromise;
  await dropLegacyUniqueEmailIndex();
}

export async function disconnectDatabase(): Promise<void> { await mongoose.disconnect(); }
