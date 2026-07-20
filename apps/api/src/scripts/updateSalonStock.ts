import mongoose from 'mongoose';
import { env } from '../config/env';
import { Salon } from '../modules/salons/salon.model';
import { salonStockAsOf, salonStockNames, salonStockSeedItems } from '../modules/salons/salonStock.data';
import { SalonStockItem } from '../modules/salons/salonStockItem.model';

async function updateSalonStock(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI, { maxPoolSize: 2 });

  const salons = await Salon.find({ name: { $in: salonStockNames }, deletedAt: null }).select('_id name').lean();
  const salonsByName = new Map(salons.map((salon: any) => [salon.name, salon]));
  const missingSalons = salonStockNames.filter((name) => !salonsByName.has(name));
  if (missingSalons.length) {
    throw new Error(`No se actualizó ningún stock. Faltan salones existentes: ${missingSalons.join(', ')}.`);
  }

  const operations = salonStockSeedItems.flatMap((item, displayOrder) => salonStockNames.map((salonName) => ({
    updateOne: {
      filter: { salonId: salonsByName.get(salonName)!._id, itemKey: item.itemKey },
      update: {
        $set: { currentQuantity: item.quantities[salonName], stockAsOf: salonStockAsOf },
        $setOnInsert: {
          salonId: salonsByName.get(salonName)!._id,
          itemKey: item.itemKey,
          name: item.name,
          category: item.category,
          unitOfMeasure: 'unidad',
          displayOrder,
          active: true,
          deletedAt: null
        }
      },
      upsert: true
    }
  })));

  const result = await SalonStockItem.bulkWrite(operations, { ordered: true });
  console.info(`Stock de salones actualizado: ${result.matchedCount} existentes y ${result.upsertedCount} nuevos, sin modificar datos de los salones.`);
}

updateSalonStock()
  .then(() => mongoose.disconnect())
  .catch(async (error) => {
    console.error('Falló la actualización del stock de salones:', error);
    await mongoose.disconnect();
    process.exitCode = 1;
  });
