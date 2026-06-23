import mongoose from 'mongoose';
import { env } from '../config/env';

export async function connectDatabase(): Promise<void> {
  mongoose.connection.on('error', (error) => console.error('MongoDB connection error:', error));
  mongoose.connection.once('connected', () => console.info(`MongoDB connected: ${mongoose.connection.host}`));
  await mongoose.connect(env.MONGODB_URI);
}

export async function disconnectDatabase(): Promise<void> { await mongoose.disconnect(); }
