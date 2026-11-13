import { MongoClient } from "mongodb";

let client;
let database;

export async function getDatabase() {
  if (database) return database;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");
  client = new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 0,
    connectTimeoutMS: 10000,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 30000
  });
  await client.connect();
  database = client.db(process.env.MONGODB_DB || "apna_vyapar");
  await Promise.all([
    database.collection("accounts").createIndex({ phone: 1 }, { unique: true }),
    database.collection("profiles").createIndex({ userId: 1 }),
    database.collection("records").createIndex({ profileId: 1, store: 1 }),
    database.collection("records").createIndex({ profileId: 1, key: 1 }, { unique: true })
  ]);
  return database;
}

export async function closeDatabase() {
  if (client) await client.close();
  client = undefined;
  database = undefined;
}
