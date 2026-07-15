import { connectDatabase, disconnectDatabase } from '../db/connection';
import { PackageTemplate } from '../modules/crm/crm.models';

async function removePackageTemplateNameUniqueIndex(): Promise<void> {
  await connectDatabase();
  const indexes = await PackageTemplate.collection.indexes();
  const uniqueNameIndex = indexes.find((index) => index.name === 'name_1' && index.unique);

  if (uniqueNameIndex?.name) {
    await PackageTemplate.collection.dropIndex(uniqueNameIndex.name);
    await PackageTemplate.collection.createIndex({ name: 1 }, { name: 'name_1' });
    console.info('El índice único de PackageTemplate.name fue reemplazado por un índice normal.');
    return;
  }

  console.info('PackageTemplate.name ya permite valores repetidos.');
}

removePackageTemplateNameUniqueIndex()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(disconnectDatabase);
