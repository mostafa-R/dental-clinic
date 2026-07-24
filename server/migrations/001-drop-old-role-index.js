import mongoose from 'mongoose';

export async function up() {
  const db = mongoose.connection.db;
  const collections = await db.listCollections({ name: 'roles' }).toArray();
  if (collections.length === 0) return;

  const indexes = await db.collection('roles').indexes();
  const oldIndex = indexes.find(
    (idx) => idx.key.tenant === 1 && idx.key.name === 1 && !idx.key.branch,
  );
  if (oldIndex) {
    await db.collection('roles').dropIndex(oldIndex.name);
  }
}
