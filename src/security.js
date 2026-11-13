const encoder = new TextEncoder();
const ITERATIONS = 310000;

export const weakPin = (pin) => {
  if (!/^\d{6}$/.test(pin)) return true;
  if (/^(\d)\1{5}$/.test(pin)) return true;
  if (["123456", "654321", "000000", "111111"].includes(pin)) return true;
  return [...pin].every((digit, index) => index === 0 || Number(digit) - Number(pin[index - 1]) === Number(pin[1]) - Number(pin[0]));
};

export async function derivePinHash(pin, salt) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, material, 256);
  return toBase64(new Uint8Array(bits));
}

export function toBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

export function fromBase64(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

export async function auditHash(previous, entry) {
  const data = encoder.encode(`${previous || ""}|${JSON.stringify(entry)}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toBase64(new Uint8Array(digest));
}
