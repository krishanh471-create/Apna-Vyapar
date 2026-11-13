import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { getDatabase } from "./db.js";

function secret() {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not configured");
  return process.env.JWT_SECRET;
}

export function issueToken(accountId) {
  return jwt.sign({ sub: accountId.toString() }, secret(), { expiresIn: "30d" });
}

export function requireAuth(request, response, next) {
  try {
    const header = request.headers.authorization || "";
    if (!header.startsWith("Bearer ")) return response.status(401).json({ error: "Authentication required" });
    const payload = jwt.verify(header.slice(7), secret());
    request.accountId = new ObjectId(payload.sub);
    next();
  } catch {
    response.status(401).json({ error: "Invalid or expired session" });
  }
}

export async function findAccount(phone) {
  return (await getDatabase()).collection("accounts").findOne({ phone });
}
