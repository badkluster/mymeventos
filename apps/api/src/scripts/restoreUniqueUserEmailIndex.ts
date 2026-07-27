import mongoose from 'mongoose';
import { env } from '../config/env';
import { User } from '../modules/users/user.model';

const EMAIL_INDEX_NAME = 'normalizedEmail_unique';

async function main(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);

  const duplicates = await User.aggregate<{ _id: string; usernames: string[]; count: number }>([
    { $match: { normalizedEmail: { $type: 'string', $ne: '' } } },
    { $group: { _id: '$normalizedEmail', usernames: { $push: '$username' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $project: { _id: 1, usernames: 1, count: 1 } }
  ]);

  if (duplicates.length) {
    const accounts = duplicates.map((group) => group.usernames.join(', ')).join(' | ');
    throw new Error(`No se puede crear el índice único de email: hay ${duplicates.length} correo(s) duplicado(s) entre estas cuentas: ${accounts}. Corregí sus correos y ejecutá nuevamente este comando.`);
  }

  const indexes = await User.collection.indexes();
  const current = indexes.find((index) => index.name === EMAIL_INDEX_NAME);
  if (current?.unique) {
    console.info('El índice único de email ya existe.');
    return;
  }
  if (current) await User.collection.dropIndex(EMAIL_INDEX_NAME);
  await User.collection.createIndex({ normalizedEmail: 1 }, { name: EMAIL_INDEX_NAME, unique: true });
  console.info('Índice único de email creado correctamente.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => mongoose.disconnect());
