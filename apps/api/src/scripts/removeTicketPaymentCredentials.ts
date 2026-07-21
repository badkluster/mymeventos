import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../db/connection';

async function removeTicketPaymentCredentials() {
  await connectDatabase();
  const result = await mongoose.connection
    .collection('ticketpaymentintegrations')
    .updateMany(
      {},
      {
        $unset: {
          publicKey: '',
          encryptedAccessToken: '',
          encryptedRefreshToken: '',
          encryptedWebhookSecret: '',
        },
      },
    );
  console.info('Credenciales legacy de Mercado Pago eliminadas:', {
    documentosModificados: result.modifiedCount,
  });
}

removeTicketPaymentCredentials()
  .then(disconnectDatabase)
  .catch(async (error) => {
    console.error('No se pudieron eliminar las credenciales legacy de Mercado Pago:', error);
    await disconnectDatabase();
    process.exitCode = 1;
  });
