const endpoint = import.meta.env.VITE_PAYOUT_API_URL;

export async function createPayout(payload) {
  if (!endpoint) {
    throw new Error("Payout service is not configured. Set VITE_PAYOUT_API_URL on the trusted server.");
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Payout service rejected the request.");
  return response.json();
}
