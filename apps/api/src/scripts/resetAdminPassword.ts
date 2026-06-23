import { env } from '../config/env';
import { connectDatabase, disconnectDatabase } from '../db/connection';
import { User } from '../modules/users/user.model';
import { hashPassword } from '../utils/password';

async function resetAdminPassword(): Promise<void> {
  if (env.NODE_ENV === 'production') throw new Error('Este script no puede ejecutarse en producción.');
  const username = process.env.RESET_ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.RESET_ADMIN_PASSWORD;
  if (!username || !password || password.length < 6) throw new Error('RESET_ADMIN_USERNAME y RESET_ADMIN_PASSWORD (mínimo 12 caracteres) son obligatorios.');

  await connectDatabase();
  const result = await User.updateOne({ username, deletedAt: null }, { passwordHash: await hashPassword(password), failedLoginAttempts: 0, $unset: { lockedUntil: 1 } });
  if (!result.matchedCount) throw new Error('No se encontró el usuario administrador indicado.');
  console.info('Contraseña de administrador restablecida correctamente.');
}

resetAdminPassword().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(disconnectDatabase);
