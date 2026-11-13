import { all, exportProfile } from "./db";

const TOKEN_KEY = "apna-vyapar-sync-token";

function apiUrl() {
  return (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
}

export function isSyncConfigured() {
  return Boolean(apiUrl());
}

export function clearSyncSession() {
  window.localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  if (!isSyncConfigured()) return null;
  const token = window.localStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${apiUrl()}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || `Sync request failed (${response.status})`);
  return response.json();
}

export async function registerRemoteAccount(phone, pin, profile) {
  if (!isSyncConfigured()) return null;
  const result = await request("/api/auth/register", { method: "POST", body: JSON.stringify({ phone, pin, profile }) });
  if (result?.token) window.localStorage.setItem(TOKEN_KEY, result.token);
  return result;
}

export async function loginRemote(phone, pin) {
  if (!isSyncConfigured()) return null;
  const result = await request("/api/auth/login", { method: "POST", body: JSON.stringify({ phone, pin }) });
  if (result?.token) window.localStorage.setItem(TOKEN_KEY, result.token);
  return result;
}

export async function syncProfile(profile) {
  if (!isSyncConfigured() || !window.localStorage.getItem(TOKEN_KEY)) return null;
  const snapshot = await exportProfile(profile.id);
  const records = Object.entries(snapshot).flatMap(([store, values]) => values.map((data) => ({ store, data })));
  return request(`/api/sync/${encodeURIComponent(profile.id)}`, {
    method: "PUT",
    body: JSON.stringify({ profile, records })
  });
}

export async function pullProfile(profileId) {
  if (!isSyncConfigured() || !window.localStorage.getItem(TOKEN_KEY)) return null;
  return request(`/api/sync/${encodeURIComponent(profileId)}`);
}

export async function syncStore(profile, store) {
  const result = await syncProfile(profile);
  return result ? all(profile.id, store) : null;
}
