import "dotenv/config";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import { ObjectId } from "mongodb";
import { closeDatabase, getDatabase } from "./db.js";
import { findAccount, issueToken, requireAuth } from "./auth.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const allowedOrigin = process.env.WEB_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", async (_request, response) => {
  try {
    await getDatabase();
    response.json({ ok: true, database: "mongodb" });
  } catch {
    response.status(503).json({ ok: false, error: "MongoDB is unavailable" });
  }
});

app.post("/api/auth/register", async (request, response) => {
  const { phone, pin, profile } = request.body || {};
  if (!/^\d{10}$/.test(phone) || !/^\d{6}$/.test(pin) || !profile?.id || !profile?.type || !profile?.name) {
    return response.status(400).json({ error: "Phone, six-digit PIN, and profile details are required" });
  }
  try {
    const database = await getDatabase();
    const existing = await findAccount(phone);
    if (existing) return response.status(409).json({ error: "An account already exists for this phone number" });
    const account = { phone, pinHash: await bcrypt.hash(pin, 12), createdAt: new Date() };
    const result = await database.collection("accounts").insertOne(account);
    await saveProfile(database, result.insertedId, profile);
    response.status(201).json({ token: issueToken(result.insertedId), accountId: result.insertedId.toString() });
  } catch (error) {
    response.status(500).json({ error: error.message || "Registration failed" });
  }
});

app.post("/api/auth/login", async (request, response) => {
  const { phone, pin } = request.body || {};
  if (!/^\d{10}$/.test(phone) || !/^\d{6}$/.test(pin)) return response.status(400).json({ error: "Invalid credentials" });
  try {
    const account = await findAccount(phone);
    if (!account || !(await bcrypt.compare(pin, account.pinHash))) return response.status(401).json({ error: "Invalid credentials" });
    response.json({ token: issueToken(account._id), accountId: account._id.toString() });
  } catch (error) {
    response.status(500).json({ error: error.message || "Login failed" });
  }
});

app.put("/api/sync/:profileId", requireAuth, async (request, response) => {
  const { profileId } = request.params;
  const { profile, records } = request.body || {};
  if (!profile || profile.id !== profileId || !Array.isArray(records)) return response.status(400).json({ error: "Invalid sync payload" });
  try {
    const database = await getDatabase();
    await saveProfile(database, request.accountId, profile);
    const collection = database.collection("records");
    const keys = records.map((entry) => `${entry.store}:${entry.data.id}`);
    await collection.deleteMany({ profileId, key: { $nin: keys } });
    if (records.length) {
      await collection.bulkWrite(records.map((entry) => ({
        updateOne: {
          filter: { profileId, key: `${entry.store}:${entry.data.id}` },
          update: { $set: { profileId, key: `${entry.store}:${entry.data.id}`, store: entry.store, data: entry.data, updatedAt: new Date() } },
          upsert: true
        }
      })));
    }
    response.json({ ok: true, syncedAt: new Date().toISOString() });
  } catch (error) {
    response.status(500).json({ error: error.message || "Sync failed" });
  }
});

app.get("/api/sync/:profileId", requireAuth, async (request, response) => {
  try {
    const database = await getDatabase();
    const profile = await database.collection("profiles").findOne({ _id: request.params.profileId, userId: request.accountId });
    if (!profile) return response.status(404).json({ error: "Profile not found" });
    const records = await database.collection("records").find({ profileId: request.params.profileId }).toArray();
    response.json({ profile: profile.data, records: records.map(({ store, data }) => ({ store, data })) });
  } catch (error) {
    response.status(500).json({ error: error.message || "Sync download failed" });
  }
});

async function saveProfile(database, accountId, profile) {
  const { pinHash, pinSalt, ...safeProfile } = profile;
  await database.collection("profiles").updateOne(
    { _id: safeProfile.id, userId: new ObjectId(accountId) },
    { $set: { userId: new ObjectId(accountId), data: safeProfile, updatedAt: new Date() } },
    { upsert: true }
  );
}

const server = app.listen(port, () => console.log(`Apna Vyapar sync server listening on port ${port}`));
process.on("SIGTERM", async () => { server.close(); await closeDatabase(); });
