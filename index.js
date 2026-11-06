const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const crypto = require("node:crypto");
const { promisify } = require("node:util");

const scrypt = promisify(crypto.scrypt);
initializeApp();

// Deze configuratie blijft uitsluitend in de backend. Zet functions/admin-config.js
// niet in de GitHub-repository; het bestand staat daarom in de .gitignore.
let adminConfig = {};
try {
  adminConfig = require("./admin-config");
} catch (error) {
  console.error("functions/admin-config.js ontbreekt. Stel de beheerlogin in voordat je de backend publiceert.");
}

const SESSION_SECRET = String(adminConfig.sessionSecret || "");
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const db = () => getDatabase();
const json = (res, status, payload) => res.status(status).json(payload);
const cleanString = (value, maxLength) => String(value ?? "").trim().slice(0, maxLength);
const isConfiguredValue = value => typeof value === "string" && value.trim().length > 0 && !/^VERVANG|^CONFIGUREER/i.test(value.trim());
const adminReady = () => isConfiguredValue(adminConfig.username) && isConfiguredValue(adminConfig.password)
  && isConfiguredValue(SESSION_SECRET) && SESSION_SECRET.length >= 32;

function timingSafeEqualText(first, second) {
  const left = Buffer.from(String(first));
  const right = Buffer.from(String(second));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function makePasswordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = await scrypt(password, salt, 64);
  return { salt, hash: derived.toString("hex") };
}

function emailKey(email) {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

function createSession(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function readSession(token) {
  if (!SESSION_SECRET || !token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(encoded).digest("base64url");
  if (!timingSafeEqualText(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload || !Number.isFinite(payload.exp) || payload.exp <= Date.now()) return null;
    if (!["admin", "customer"].includes(payload.role)) return null;
    return payload;
  } catch {
    return null;
  }
}

function getSessionFromRequest(req) {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? readSession(match[1]) : null;
}

function newSessionToken(role, userData) {
  return createSession({ ...userData, role, exp: Date.now() + SESSION_DURATION_MS });
}

function validEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validImageUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

exports.api = onRequest(
  { region: "europe-west1", cors: true, maxInstances: 10, memory: "256MiB" },
  async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    res.set("X-Frame-Options", "DENY");
    res.set("Referrer-Policy", "strict-origin-when-cross-origin");

    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      const path = String(req.path || "/").replace(/\/+$/, "") || "/";

      if (req.method === "GET" && path === "/health") {
        return json(res, 200, { ok: true, service: "noir-webshop-api", adminConfigured: adminReady() });
      }

      if (req.method === "GET" && path === "/products") {
        const snapshot = await db().ref("products").get();
        const products = [];
        snapshot.forEach(child => products.push({ id: child.key, ...child.val() }));
        products.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
        return json(res, 200, { products });
      }

      if (req.method === "POST" && path === "/signup") {
        const email = cleanString(req.body?.email, 254).toLowerCase();
        const password = String(req.body?.password || "");
        if (!validEmail(email)) return json(res, 400, { error: "Vul een geldig e-mailadres in." });
        if (password.length < 10 || password.length > 128) {
          return json(res, 400, { error: "Je wachtwoord moet minimaal 10 en maximaal 128 tekens bevatten." });
        }
        if (adminReady() && email === String(adminConfig.username).trim().toLowerCase()) {
          return json(res, 400, { error: "Dit e-mailadres is gereserveerd voor sitebeheer." });
        }

        const credentials = await makePasswordHash(password);
        const accountRef = db().ref(`accounts/${emailKey(email)}`);
        const transaction = await accountRef.transaction(current => current === null
          ? { email, ...credentials, createdAt: Date.now() }
          : undefined);
        if (!transaction.committed) return json(res, 409, { error: "Er bestaat al een account met dit e-mailadres." });
        return json(res, 201, { message: "Je account is aangemaakt. Je kunt nu inloggen." });
      }

      if (req.method === "POST" && path === "/login") {
        if (!adminReady()) {
          return json(res, 503, { error: "De server is nog niet volledig ingesteld. Controleer functions/admin-config.js en gebruik een eigen sessiesleutel van minimaal 32 tekens." });
        }
        const identity = cleanString(req.body?.identity || req.body?.email || req.body?.username, 254);
        const password = String(req.body?.password || "");
        if (!identity || !password || password.length > 128) {
          return json(res, 400, { error: "Vul je inloggegevens in." });
        }

        if (adminReady() && timingSafeEqualText(identity.toLowerCase(), String(adminConfig.username).trim().toLowerCase())) {
          if (!timingSafeEqualText(password, String(adminConfig.password))) {
            return json(res, 401, { error: "Inloggegevens zijn onjuist." });
          }
          const token = newSessionToken("admin", { sub: "site-admin", username: String(adminConfig.username) });
          return json(res, 200, { token, user: { username: String(adminConfig.username), role: "admin" } });
        }

        const email = identity.toLowerCase();
        if (!validEmail(email)) return json(res, 401, { error: "Inloggegevens zijn onjuist." });
        const accountSnapshot = await db().ref(`accounts/${emailKey(email)}`).get();
        const account = accountSnapshot.val();
        if (!account || !account.salt || !account.hash) return json(res, 401, { error: "Inloggegevens zijn onjuist." });
        const candidate = await makePasswordHash(password, account.salt);
        if (!timingSafeEqualText(candidate.hash, account.hash)) {
          return json(res, 401, { error: "Inloggegevens zijn onjuist." });
        }
        const token = newSessionToken("customer", { sub: emailKey(email), email });
        return json(res, 200, { token, user: { email, role: "customer" } });
      }

      if (req.method === "GET" && path === "/session") {
        const session = getSessionFromRequest(req);
        if (!session) return json(res, 401, { error: "Je sessie is verlopen. Log opnieuw in." });
        const user = session.role === "admin"
          ? { username: session.username, role: "admin" }
          : { email: session.email, role: "customer" };
        return json(res, 200, { user });
      }

      if (path === "/admin/products" || path.startsWith("/admin/products/")) {
        const session = getSessionFromRequest(req);
        if (!session || session.role !== "admin") {
          return json(res, 403, { error: "Alleen het ingestelde sitebeheeraccount heeft toegang." });
        }

        if (req.method === "POST" && path === "/admin/products") {
          const input = req.body?.product || {};
          const name = cleanString(input.name, 90);
          const category = cleanString(input.category, 40);
          const description = cleanString(input.description, 500);
          const image = cleanString(input.image, 2000);
          const price = Number(input.price);
          if (!name || !category || !Number.isFinite(price) || price < 0 || price > 1000000 || !validImageUrl(image)) {
            return json(res, 400, { error: "Controleer de productnaam, categorie, prijs en afbeeldings-URL." });
          }
          const product = { name, category, description, image, price: Math.round(price * 100) / 100, createdAt: Date.now() };
          const productRef = db().ref("products").push();
          await productRef.set(product);
          return json(res, 201, { product: { id: productRef.key, ...product } });
        }

        if (req.method === "DELETE" && path.startsWith("/admin/products/")) {
          const id = path.slice("/admin/products/".length);
          if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return json(res, 400, { error: "Ongeldig product-ID." });
          await db().ref(`products/${id}`).remove();
          return json(res, 200, { success: true });
        }

        return json(res, 405, { error: "Deze beheeractie wordt niet ondersteund." });
      }

      return json(res, 404, { error: "API-endpoint niet gevonden." });
    } catch (error) {
      console.error("NOIR API-fout:", error);
      return json(res, 500, { error: "Er ging iets mis op de server. Controleer de Firebase Functions-logs." });
    }
  }
);
