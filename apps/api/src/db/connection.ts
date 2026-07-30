import mongoose from 'mongoose';
import { env } from '../config/env';

let connectionPromise: Promise<typeof mongoose> | null = null;

export async function connectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  if (connectionPromise) {
    await connectionPromise;
    return;
  }
  mongoose.connection.on('error', (error) => console.error('MongoDB connection error:', error));
  mongoose.connection.once('connected', () => console.info(`MongoDB connected: ${mongoose.connection.host}`));
  connectionPromise = mongoose.connect(env.MONGODB_URI, { maxPoolSize: 10 }).catch((error) => {
    connectionPromise = null;
    throw error;
  });
  await connectionPromise;
}

export async function disconnectDatabase(): Promise<void> { await mongoose.disconnect(); }
