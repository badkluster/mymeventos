import mongoose from 'mongoose';
import { env } from '../config/env';
import { dropLegacyUniqueEmailIndex } from '../modules/users/user.model';
import { dropLegacyInvitationEventIdIndex } from '../modules/invitations/invitation.models';
import { dropLegacyTicketTypeSaleIndex } from '../modules/tickets/ticket.models';

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
  await dropLegacyInvitationEventIdIndex();
  await dropLegacyTicketTypeSaleIndex();
}

export async function disconnectDatabase(): Promise<void> { await mongoose.disconnect(); }
