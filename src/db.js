const CATALOG = "apna-vyapar-catalog";
const VERSION = 4;
const STORES = ["people", "products", "sales", "payments", "expenses", "attendance", "audit", "schoolStudents", "schoolTeachers", "schoolStaff", "schoolTransport", "schoolHostels", "schoolClasses", "schoolTimetable", "schoolExams", "schoolFeePayments", "schoolQrScans", "payouts"];
let catalogPromise;
const profileDb = new Map();

function open(name, stores = STORES) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, VERSION);
    request.onupgradeneeded = () => {
      if (request.result.objectStoreNames.contains("recovery")) request.result.deleteObjectStore("recovery");
      for (const store of stores) {
        if (!request.result.objectStoreNames.contains(store)) {
          request.result.createObjectStore(store, { keyPath: "id", autoIncrement: true });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function catalog() {
  if (!catalogPromise) {
    catalogPromise = open(CATALOG, ["profiles", "migration"]).then(async (db) => {
      const profiles = await readDb(db, "profiles");
      if (!profiles.length) await migrateLegacy(db);
      return db;
    });
  }
  return catalogPromise;
}

async function migrateLegacy(targetDb) {
  const legacy = await new Promise((resolve) => {
    const request = indexedDB.open("apna-vyapar", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  if (!legacy) return;
  const legacyProfiles = await readDb(legacy, "profiles").catch(() => []);
  for (const oldProfile of legacyProfiles) {
    const id = crypto.randomUUID();
    const profile = { ...oldProfile, id, needsMigration: true, pinHash: null };
    await writeDb(targetDb, "profiles", profile);
    const db = await open(`apna-vyapar-${id}`);
    for (const store of STORES) {
      if (store === "profiles") continue;
      const rows = await readDb(legacy, store).catch(() => []);
      for (const row of rows.filter((item) => item.profileId === oldProfile.id)) {
        await writeDb(db, store, { ...row, profileId: id });
      }
    }
  }
}

export async function listProfiles() {
  const profiles = await readDb(await catalog(), "profiles");
  return profiles.map(({ recoveryCode, offlineOtpCodes, recoveryUsed, ...profile }) => profile);
}

export async function saveProfile(profile) {
  const { recoveryCode, offlineOtpCodes, recoveryUsed, ...cleanProfile } = profile;
  return writeDb(await catalog(), "profiles", cleanProfile);
}

export async function deleteProfile(profileId) {
  const db = await catalog();
  await deleteDb(db, "profiles", profileId);
  profileDb.delete(profileId);
  indexedDB.deleteDatabase(`apna-vyapar-${profileId}`);
}

export async function getProfileDb(profileId) {
  if (!profileDb.has(profileId)) profileDb.set(profileId, open(`apna-vyapar-${profileId}`));
  return profileDb.get(profileId);
}

export async function all(profileId, store) {
  return readDb(await getProfileDb(profileId), store);
}

export async function put(profileId, store, value) {
  return writeDb(await getProfileDb(profileId), store, { ...value, profileId });
}

export async function remove(profileId, store, id) {
  return deleteDb(await getProfileDb(profileId), store, id);
}

export async function clearProfile(profileId) {
  const db = await getProfileDb(profileId);
  await Promise.all(STORES.map((store) => clearDb(db, store)));
}

export async function exportProfile(profileId) {
  const data = {};
  for (const store of STORES) data[store] = await all(profileId, store);
  return data;
}

function readDb(db, store) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function writeDb(db, store, value) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, "readwrite").objectStore(store).put(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function deleteDb(db, store, id) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, "readwrite").objectStore(store).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function clearDb(db, store) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, "readwrite").objectStore(store).clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
