const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const scrypt = promisify(crypto.scrypt);
initializeApp();

// Maak functions/admin-config.js op basis van admin-config.example.js.
// Dit bestand bevat alleen de beheerlogin en mag nooit naar GitHub worden gepusht.
let adminConfig;
try { adminConfig = require("./admin-config"); }
catch { adminConfig = { username: "CONFIGUREER-BEHEERDER", password: "CONFIGUREER-EEN-UNIEK-WACHTWOORD" }; }
const SESSION_SECRET = process.env.SESSION_SECRET || adminConfig.sessionSecret || "VERANDER-DIT-NAAR-EEN-LANGE-WILLEKEURIGE-SLEUTEL";
const db = () => getDatabase();
const json = (res, status, data) => res.status(status).json(data);
const hash = async (password, salt = crypto.randomBytes(16).toString("hex")) => ({ salt, hash: (await scrypt(password, salt, 64)).toString("hex") });
const safeEqual = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function sign(payload) { const body = Buffer.from(JSON.stringify(payload)).toString("base64url"); return `${body}.${crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url")}`; }
function verify(token) {
  if (!token || SESSION_SECRET.startsWith("VERANDER-DIT")) return null;
  const [body, signature] = token.split("."); if (!body || !signature) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  if (!safeEqual(signature, expected)) return null;
  try { const data = JSON.parse(Buffer.from(body, "base64url").toString()); return data.exp > Date.now() ? data : null; } catch { return null; }
}
const emailKey = email => crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
function bearer(req) { return (req.headers.authorization || "").replace(/^Bearer\s+/i, ""); }
function requireUser(req) { return verify(bearer(req)); }

exports.api = onRequest({ region: "europe-west1", cors: true, maxInstances: 10 }, async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const path = req.path.replace(/\/+$/, "") || "/";
    if (req.method === "GET" && path === "/session") {
      const session = requireUser(req); if (!session) return json(res, 401, { error: "Sessie verlopen." });
      return json(res, 200, { user: session.role === "admin" ? { username: adminConfig.username, role: "admin" } : { email: session.email, role: "customer" } });
    }
    if (req.method === "GET" && path === "/products") {
      const snap = await db().ref("products").get();
      const products = []; snap.forEach(child => products.push({ id: child.key, ...child.val() }));
      products.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
      return json(res, 200, { products });
    }
    if (req.method === "POST" && path === "/signup") {
      const email = String(req.body?.email || "").trim().toLowerCase(); const password = String(req.body?.password || "");
      if (!/^\S+@\S+\.\S+$/.test(email)) return json(res, 400, { error: "Vul een geldig e-mailadres in." });
      if (password.length < 10) return json(res, 400, { error: "Gebruik minimaal 10 tekens voor je wachtwoord." });
      if (email === String(adminConfig.username || "").toLowerCase()) return json(res, 400, { error: "Dit account kan niet worden geregistreerd." });
      const ref = db().ref(`accounts/${emailKey(email)}`);
      const credentials = await hash(password);
      const result = await ref.transaction(current => current === null ? { email, ...credentials, createdAt: Date.now() } : undefined);
      if (!result.committed) return json(res, 409, { error: "Er bestaat al een account met dit e-mailadres." });
      return json(res, 201, { message: "Account aangemaakt. Je kunt nu inloggen." });
    }
    if (req.method === "POST" && path === "/login") {
      const identity = String(req.body?.email || req.body?.username || "").trim(); const password = String(req.body?.password || "");
      if (safeEqual(identity.toLowerCase(), String(adminConfig.username || "").toLowerCase()) && !String(adminConfig.password || "").startsWith("VERVANG-DIT") && safeEqual(password, adminConfig.password)) {
        return json(res, 200, { token: sign({ sub: "site-admin", role: "admin", exp: Date.now() + 7*24*60*60*1000 }), user: { username: adminConfig.username, role: "admin" } });
      }
      const email = identity.toLowerCase(); const snap = await db().ref(`accounts/${emailKey(email)}`).get(); const account = snap.val();
      if (!account) return json(res, 401, { error: "Inloggegevens zijn onjuist." });
      const candidate = await hash(password, account.salt);
      if (!safeEqual(candidate.hash, account.hash)) return json(res, 401, { error: "Inloggegevens zijn onjuist." });
      return json(res, 200, { token: sign({ sub: emailKey(email), email, role: "customer", exp: Date.now() + 7*24*60*60*1000 }), user: { email, role: "customer" } });
    }
    if (req.method === "POST" && path.startsWith("/admin/products")) {
      const user = requireUser(req); if (!user || user.role !== "admin") return json(res, 401, { error: "Alleen sitebeheer heeft toegang." });
      if (path === "/admin/products" && req.body?.action === "create") {
        const p = req.body.product || {}; const name = String(p.name || "").trim(); const category = String(p.category || "").trim(); const price = Number(p.price);
        if (!name || name.length > 90 || !category || category.length > 40 || !Number.isFinite(price) || price < 0) return json(res, 400, { error: "Controleer de productgegevens." });
        const product = { name, category, price, image: String(p.image || "").slice(0,2000), description: String(p.description || "").slice(0,500), createdAt: Date.now() };
        const ref = db().ref("products").push(); await ref.set(product); return json(res, 201, { product: { id: ref.key, ...product } });
      }
      const id = path.split("/").pop(); if (!id || id === "products") return json(res, 400, { error: "Product-ID ontbreekt." });
      await db().ref(`products/${id}`).remove(); return json(res, 200, { success: true });
    }
    return json(res, 404, { error: "Endpoint niet gevonden." });
  } catch (error) { console.error(error); return json(res, 500, { error: "Er ging iets mis op de server." }); }
});
