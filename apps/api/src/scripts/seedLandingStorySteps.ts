import fs from 'fs';
import path from 'path';
import { connectDatabase, disconnectDatabase } from '../db/connection';
import { LandingStoryStep } from '../modules/landing/landing.models';
import { uploadBuffer } from '../modules/uploads/cloudinary.service';

type SeedStep = { title: string; description: string; file: string; displayOrder: number };

const steps: SeedStep[] = [
  { title: 'Nos contás tu idea', description: 'Escuchamos lo que soñás para tu evento.', file: 'step-1.jpg', displayOrder: 1 },
  { title: 'Te asesoramos', description: 'Te guiamos para elegir salón, menú y servicios.', file: 'step-2.jpg', displayOrder: 2 },
  { title: 'Armamos tu propuesta', description: 'Diseñamos una propuesta clara y personalizada.', file: 'step-3.jpg', displayOrder: 3 },
  { title: 'Reservás tu fecha', description: 'Confirmás y asegurás tu fecha.', file: 'step-4.jpg', displayOrder: 4 },
];

const imagesDir = path.resolve(__dirname, '../../../web/public/images/story');

async function seedStep(input: SeedStep): Promise<string> {
  const existing = await LandingStoryStep.findOne({ title: input.title, deletedAt: null }).lean<{ imageUrl?: string } | null>();
  let imageUrl: string | undefined = existing?.imageUrl;
  if (!imageUrl) {
    const buffer = fs.readFileSync(path.join(imagesDir, input.file));
    const asset = await uploadBuffer(buffer, {
      folder: 'mym-eventos/general',
      resource_type: 'image',
      use_filename: true,
      unique_filename: true,
      overwrite: false,
      type: 'upload',
    });
    imageUrl = asset.secureUrl;
  }
  await LandingStoryStep.findOneAndUpdate(
    { title: input.title, deletedAt: null },
    { $set: { description: input.description, imageUrl, displayOrder: input.displayOrder, active: true } },
    { upsert: true, setDefaultsOnInsert: true },
  );
  return imageUrl;
}

async function seed() {
  await connectDatabase();
  for (const step of steps) {
    const imageUrl = await seedStep(step);
    console.info(`"${step.title}" -> ${imageUrl}`);
  }
  console.info(`Pasos de "Cómo trabajamos" sembrados: ${steps.length}.`);
}

seed().then(disconnectDatabase).catch(async (error) => {
  console.error('Seed de pasos de "Cómo trabajamos" falló:', error);
  await disconnectDatabase();
  process.exitCode = 1;
});
