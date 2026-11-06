import { API_URL } from "./config.js";

const app = document.querySelector("#app");
const state = {
  products: [],
  cart: readCart(),
  user: null,
  token: localStorage.getItem("noir_session") || "",
  category: "Alles",
  search: "",
  loading: true,
  loadError: ""
};

function readCart() {
  try {
    const value = JSON.parse(localStorage.getItem("noir_cart") || "[]");
    return Array.isArray(value) ? value.filter(item => item && typeof item.id === "string" && Number.isInteger(item.qty) && item.qty > 0) : [];
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem("noir_cart", JSON.stringify(state.cart));
}

const $ = (selector, root = document) => root.querySelector(selector);
const money = value => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(value || 0));
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));

async function api(path, { method = "GET", body, auth = true } = {}) {
  let response;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(auth && state.token ? { Authorization: `Bearer ${state.token}` } : {})
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("De webshopserver reageert niet binnen 15 seconden. Controleer of de Firebase Functions online zijn.");
    throw new Error("De verbinding met de webshopserver is mislukt. Controleer of de Firebase Functions zijn gepubliceerd.");
  } finally {
    window.clearTimeout(timeoutId);
  }

  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { /* De server gaf geen JSON terug. */ }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("De webshop-API is niet gevonden (404). Publiceer de Firebase Function 'api' en controleer het API-adres in src/config.js.");
    }
    if (response.status >= 500) {
      throw new Error(data.error || "De webshopserver heeft een fout gemaakt. Controleer de Firebase Functions-logs.");
    }
    throw new Error(data.error || `De aanvraag is mislukt (${response.status}).`);
  }
  return data;
}

function categories() {
  return ["Alles", ...new Set(state.products.map(product => product.category).filter(Boolean).sort((a, b) => a.localeCompare(b, "nl")))];
}

function filteredProducts() {
  const needle = state.search.trim().toLocaleLowerCase("nl");
  return state.products.filter(product => {
    const matchesCategory = state.category === "Alles" || product.category === state.category;
    const text = `${product.name || ""} ${product.description || ""} ${product.category || ""}`.toLocaleLowerCase("nl");
    return matchesCategory && text.includes(needle);
  });
}

function renderHeader() {
  const accountControls = state.user
    ? `<span class="account-name" title="${escapeHtml(state.user.email || state.user.username)}">${escapeHtml(state.user.email || state.user.username)}</span>
       ${state.user.role === "admin" ? `<button class="text-button" id="admin-open">Sitebeheer</button>` : ""}
       <button class="text-button" id="logout">Uitloggen</button>`
    : `<button class="text-button" id="account-open">Inloggen <span aria-hidden="true">↗</span></button>`;

  return `<header class="site-header">
    <a class="brand" href="#top" aria-label="NOIR home"><span class="brand-icon">N</span><span>NOIR<span class="gold">.</span></span></a>
    <label class="search-box"><span class="search-icon" aria-hidden="true">⌕</span><input id="search" type="search" autocomplete="off" placeholder="Zoek producten..." value="${escapeHtml(state.search)}" aria-label="Zoek producten"></label>
    <nav class="header-actions" aria-label="Hoofdnavigatie">
      ${accountControls}
      <button class="cart-button" id="cart-open" aria-label="Winkelwagen openen"><span>Winkelwagen</span><b>${cartCount()}</b></button>
    </nav>
  </header>`;
}

function cartCount() {
  return state.cart.reduce((total, item) => total + item.qty, 0);
}

function productCard(product) {
  const image = validImageUrl(product.image)
    ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" />`
    : `<div class="product-placeholder"><span>NOIR / OBJECT</span><b>${escapeHtml((product.name || "N").slice(0, 1).toUpperCase())}</b></div>`;

  return `<article class="product-card">
    <div class="product-visual">${image}
      <span class="product-tag">${escapeHtml(product.category || "Collectie")}</span>
      <button class="add-button" data-add="${escapeHtml(product.id)}" aria-label="${escapeHtml(product.name)} toevoegen aan winkelwagen">+</button>
    </div>
    <div class="product-details"><div class="product-copy"><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.description || "Een bijzondere toevoeging aan de collectie.")}</p></div><strong>${money(product.price)}</strong></div>
  </article>`;
}

function renderProducts() {
  const products = filteredProducts();
  const list = $("#product-grid");
  const count = $("#product-count");
  if (!list || !count) return;
  count.textContent = `${products.length} ${products.length === 1 ? "product" : "producten"}`;

  if (state.loading) {
    list.innerHTML = `<div class="empty-state"><span class="loader"></span><h3>De collectie wordt geladen</h3><p>Een moment geduld.</p></div>`;
  } else if (state.loadError) {
    list.innerHTML = `<div class="empty-state error-state"><span class="empty-symbol">!</span><h3>De collectie kon niet worden geladen</h3><p>${escapeHtml(state.loadError)}</p><button class="outline-button" id="retry-products">Opnieuw proberen</button></div>`;
  } else if (!products.length) {
    list.innerHTML = `<div class="empty-state"><span class="empty-symbol">—</span><h3>${state.products.length ? "Geen resultaten gevonden" : "De collectie wordt samengesteld"}</h3><p>${state.products.length ? "Pas je zoekopdracht of categorie aan." : "Binnenkort vind je hier onze eerste producten."}</p></div>`;
  } else {
    list.innerHTML = products.map(productCard).join("");
  }
  list.querySelectorAll("[data-add]").forEach(button => button.addEventListener("click", () => addToCart(button.dataset.add)));
  $("#retry-products")?.addEventListener("click", loadProducts);
}

function render() {
  app.innerHTML = `${renderHeader()}
    <main id="top">
      <section class="hero-section">
        <div class="hero-content"><p class="eyebrow"><span></span> EEN NIEUWE KIJK OP ALLEDAAGS</p>
          <h1>Gekozen met<br><em>aandacht.</em></h1>
          <p class="hero-description">Ontdek bijzondere producten, zorgvuldig geselecteerd op uitstraling, kwaliteit en karakter.</p>
          <a class="hero-cta" href="#collectie">ONTDEK DE COLLECTIE <span>↘</span></a>
          <div class="hero-meta"><span>NO. 01</span><span>THE NOIR EDITION</span></div>
        </div>
        <div class="hero-art" aria-hidden="true"><div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div><div class="art-shape"><span>N</span></div><div class="art-note">OBJECTS<br>WITH PURPOSE</div><div class="art-index">N° / 001</div></div>
        <div class="hero-side-note">SELECTED FOR EVERYDAY LIVING</div>
      </section>
      <section class="trust-strip" aria-label="Onze beloftes"><div><span>01</span><p><b>Met aandacht gekozen</b><small>Een collectie met karakter.</small></p></div><div><span>02</span><p><b>Persoonlijk account</b><small>Je eigen vertrouwde omgeving.</small></p></div><div><span>03</span><p><b>Direct contact</b><small>Persoonlijke service wanneer je die nodig hebt.</small></p></div></section>
      <section class="collection-section" id="collectie">
        <div class="section-top"><div><p class="eyebrow">ONTDEK NOIR</p><h2>De collectie<span class="gold">.</span></h2></div><span class="product-count" id="product-count">—</span></div>
        <div class="collection-controls"><div class="category-list">${categories().map(category => `<button class="category-chip ${state.category === category ? "active" : ""}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("")}</div><span class="collection-note">EEN SELECTIE MET AANDACHT</span></div>
        <div class="product-grid" id="product-grid"></div>
      </section>
    </main>
    <footer class="site-footer"><a class="brand" href="#top"><span class="brand-icon">N</span><span>NOIR<span class="gold">.</span></span></a><span>© ${new Date().getFullYear()} NOIR — Alle rechten voorbehouden.</span><a href="#top">TERUG NAAR BOVEN ↑</a></footer>
    <div id="modal-root"></div>`;

  $("#search").addEventListener("input", event => {
    const cursor = event.target.selectionStart;
    state.search = event.target.value;
    renderProducts();
    const input = $("#search");
    input.focus();
    input.setSelectionRange(cursor, cursor);
  });
  app.querySelectorAll("[data-category]").forEach(button => button.addEventListener("click", () => {
    state.category = button.dataset.category;
    render();
  }));
  $("#account-open")?.addEventListener("click", accountModal);
  $("#admin-open")?.addEventListener("click", adminPanel);
  $("#cart-open")?.addEventListener("click", cartModal);
  $("#logout")?.addEventListener("click", logout);
  renderProducts();
}

function validImageUrl(value) {
  if (!value) return false;
  try { return ["https:", "http:"].includes(new URL(value).protocol); } catch { return false; }
}

async function loadProducts() {
  state.loading = true;
  state.loadError = "";
  if (!$("#product-grid")) render(); else renderProducts();
  try {
    const result = await api("/products", { auth: false });
    state.products = Array.isArray(result.products) ? result.products : [];
  } catch (error) {
    state.loadError = error.message;
  } finally {
    state.loading = false;
    if (!$("#product-grid")) render(); else renderProducts();
  }
}

function showModal(content, className = "") {
  const root = $("#modal-root");
  if (!root) return;
  root.innerHTML = `<div class="modal-backdrop"><section class="modal-card ${className}" role="dialog" aria-modal="true">${content}</section></div>`;
  $(".modal-backdrop", root).addEventListener("click", event => {
    if (event.target.classList.contains("modal-backdrop")) closeModal();
  });
  $("[data-close-modal]", root)?.addEventListener("click", closeModal);
}

function closeModal() {
  const root = $("#modal-root");
  if (root) root.innerHTML = "";
}

function accountModal() {
  showModal(`<button class="modal-close" data-close-modal aria-label="Sluiten">×</button>
    <p class="eyebrow">JOUW NOIR ACCOUNT</p><h2>Welkom <em>terug.</em></h2><p class="modal-intro">Log in of maak een persoonlijk account aan.</p>
    <div class="auth-switch"><button class="auth-tab selected" data-auth-mode="login">Inloggen</button><button class="auth-tab" data-auth-mode="signup">Account aanmaken</button></div>
    <form id="auth-form" class="form-stack"><label id="identity-label">E-mailadres of beheerdersnaam<input id="identity" type="text" required autocomplete="username" placeholder="jij@voorbeeld.nl" /></label>
      <label>Wachtwoord<input id="password" type="password" required minlength="10" maxlength="128" autocomplete="current-password" placeholder="Minimaal 10 tekens" /></label>
      <label id="confirm-wrap" class="hidden">Herhaal wachtwoord<input id="confirm-password" type="password" minlength="10" maxlength="128" autocomplete="new-password" /></label>
      <button class="gold-button" id="auth-submit" type="submit">Inloggen <span>→</span></button><p class="form-message" id="auth-message" aria-live="polite"></p>
    </form><p class="security-note">Je wachtwoord wordt beveiligd verwerkt. NOIR gebruikt geen Firebase Authentication.</p>`);

  let mode = "login";
  const setMode = nextMode => {
    mode = nextMode;
    $("#identity-label").innerHTML = `${mode === "login" ? "E-mailadres of beheerdersnaam" : "E-mailadres"}<input id="identity" type="${mode === "login" ? "text" : "email"}" required autocomplete="username" placeholder="${mode === "login" ? "jij@voorbeeld.nl of beheerdersnaam" : "jij@voorbeeld.nl"}" />`;
    $("#confirm-wrap").classList.toggle("hidden", mode !== "signup");
    $("#password").autocomplete = mode === "login" ? "current-password" : "new-password";
    $("#auth-submit").innerHTML = `${mode === "login" ? "Inloggen" : "Account aanmaken"} <span>→</span>`;
    $("#auth-message").textContent = "";
    document.querySelectorAll("[data-auth-mode]").forEach(button => button.classList.toggle("selected", button.dataset.authMode === mode));
  };
  document.querySelectorAll("[data-auth-mode]").forEach(button => button.addEventListener("click", () => setMode(button.dataset.authMode)));
  $("#auth-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("#auth-submit");
    const message = $("#auth-message");
    const identity = $("#identity").value.trim();
    const password = $("#password").value;
    if (mode === "signup" && password !== $("#confirm-password").value) {
      message.textContent = "De wachtwoorden komen niet overeen.";
      return;
    }
    button.disabled = true;
    message.textContent = "Bezig met verwerken...";
    try {
      if (mode === "signup") {
        const result = await api("/signup", { method: "POST", auth: false, body: { email: identity, password } });
        const successMessage = result.message || "Je account is aangemaakt. Je kunt nu inloggen.";
        $("#password").value = "";
        $("#confirm-password").value = "";
        setMode("login");
        $("#auth-message").textContent = successMessage;
      } else {
        const result = await api("/login", { method: "POST", auth: false, body: { identity, password } });
        state.token = result.token;
        state.user = result.user;
        localStorage.setItem("noir_session", state.token);
        closeModal();
        render();
        notify("Je bent ingelogd.");
      }
    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}

function logout() {
  state.token = "";
  state.user = null;
  localStorage.removeItem("noir_session");
  render();
  notify("Je bent uitgelogd.");
}

function addToCart(id) {
  const product = state.products.find(item => item.id === id);
  if (!product) return;
  const existing = state.cart.find(item => item.id === id);
  if (existing) existing.qty += 1;
  else state.cart.push({ id, qty: 1 });
  saveCart();
  render();
  notify("Toegevoegd aan je winkelwagen.");
}

function cartModal() {
  const rows = state.cart.map(item => ({ ...item, product: state.products.find(product => product.id === item.id) })).filter(item => item.product);
  const total = rows.reduce((sum, item) => sum + Number(item.product.price || 0) * item.qty, 0);
  showModal(`<button class="modal-close" data-close-modal aria-label="Sluiten">×</button><p class="eyebrow">JOUW SELECTIE</p><h2>Winkelwagen<span class="gold">.</span></h2>
    ${rows.length ? `<div class="cart-items">${rows.map(item => `<div class="cart-row"><div class="cart-product"><b>${escapeHtml(item.product.name)}</b><small>${money(item.product.price)} per stuk</small></div><div class="quantity-control"><button data-qty="minus" data-id="${escapeHtml(item.id)}" aria-label="Aantal verlagen">−</button><span>${item.qty}</span><button data-qty="plus" data-id="${escapeHtml(item.id)}" aria-label="Aantal verhogen">+</button></div><strong>${money(Number(item.product.price) * item.qty)}</strong><button class="remove-item" data-remove="${escapeHtml(item.id)}" aria-label="Verwijderen">×</button></div>`).join("")}</div>` : `<div class="cart-empty"><span>—</span><p>Je winkelwagen is nog leeg.</p></div>`}
    <div class="cart-total"><span>Totaal</span><strong>${money(total)}</strong></div><div class="checkout-note">Afrekenen is nog niet aangesloten. De winkelwagen bewaart je selectie op dit apparaat.</div>`, "cart-modal");
  document.querySelectorAll("[data-qty]").forEach(button => button.addEventListener("click", () => {
    const item = state.cart.find(entry => entry.id === button.dataset.id);
    if (!item) return;
    item.qty += button.dataset.qty === "plus" ? 1 : -1;
    state.cart = state.cart.filter(entry => entry.qty > 0);
    saveCart(); cartModal(); renderHeaderOnly();
  }));
  document.querySelectorAll("[data-remove]").forEach(button => button.addEventListener("click", () => {
    state.cart = state.cart.filter(entry => entry.id !== button.dataset.remove);
    saveCart(); cartModal(); renderHeaderOnly();
  }));
}

function renderHeaderOnly() {
  const old = $(".site-header");
  if (!old) return;
  const template = document.createElement("div");
  template.innerHTML = renderHeader();
  old.replaceWith(template.firstElementChild);
  $("#account-open")?.addEventListener("click", accountModal);
  $("#admin-open")?.addEventListener("click", adminPanel);
  $("#cart-open")?.addEventListener("click", cartModal);
  $("#logout")?.addEventListener("click", logout);
  const search = $("#search");
  search?.addEventListener("input", event => { state.search = event.target.value; renderProducts(); });
}

function adminPanel() {
  if (state.user?.role !== "admin") return;
  const productRows = state.products.map(product => `<div class="admin-product"><span><b>${escapeHtml(product.name)}</b><small>${money(product.price)} · ${escapeHtml(product.category)}</small></span><button class="delete-button" data-delete-product="${escapeHtml(product.id)}">Verwijderen</button></div>`).join("");
  showModal(`<button class="modal-close" data-close-modal aria-label="Sluiten">×</button><p class="eyebrow">NOIR BACK OFFICE</p><h2>Productbeheer<span class="gold">.</span></h2><p class="modal-intro">Voeg producten toe aan de collectie of verwijder bestaande producten.</p>
    <form id="product-form" class="admin-form"><label>Productnaam<input id="product-name" required maxlength="90" /></label><label>Prijs in euro<input id="product-price" type="number" min="0" max="1000000" step="0.01" required /></label><label>Categorie<input id="product-category" required maxlength="40" placeholder="Bijv. Accessoires" /></label><label>Afbeeldings-URL<input id="product-image" type="url" maxlength="2000" placeholder="https://..." /></label><label class="form-wide">Beschrijving<textarea id="product-description" maxlength="500" rows="3"></textarea></label><button class="gold-button form-wide" type="submit">Product toevoegen <span>→</span></button><p class="form-message form-wide" id="admin-message" aria-live="polite"></p></form>
    <h3 class="admin-list-title">Bestaande producten</h3><div class="admin-product-list">${productRows || `<p class="muted-text">Er zijn nog geen producten.</p>`}</div>`, "admin-modal");
  $("#product-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("#product-form button[type='submit']");
    const message = $("#admin-message");
    button.disabled = true;
    try {
      await api("/admin/products", { method: "POST", body: { action: "create", product: {
        name: $("#product-name").value.trim(),
        price: Number($("#product-price").value),
        category: $("#product-category").value.trim(),
        image: $("#product-image").value.trim(),
        description: $("#product-description").value.trim()
      } } });
      await refreshProducts();
      adminPanel();
      notify("Product toegevoegd.");
    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  document.querySelectorAll("[data-delete-product]").forEach(button => button.addEventListener("click", async () => {
    if (!window.confirm("Weet je zeker dat je dit product wilt verwijderen?")) return;
    button.disabled = true;
    try {
      await api(`/admin/products/${encodeURIComponent(button.dataset.deleteProduct)}`, { method: "DELETE" });
      await refreshProducts();
      adminPanel();
      notify("Product verwijderd.");
    } catch (error) {
      button.disabled = false;
      notify(error.message);
    }
  }));
}

async function refreshProducts() {
  const result = await api("/products", { auth: false });
  state.products = Array.isArray(result.products) ? result.products : [];
  state.loading = false;
  state.loadError = "";
  renderProducts();
}

function notify(message) {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 2800);
}

async function restoreSession() {
  if (!state.token) return;
  try {
    const result = await api("/session");
    state.user = result.user;
  } catch {
    state.token = "";
    state.user = null;
    localStorage.removeItem("noir_session");
  }
}

async function start() {
  await restoreSession();
  render();
  await loadProducts();
}

start().catch(error => {
  console.error("NOIR initialisatie mislukt:", error);
  app.innerHTML = `<main class="fatal-screen"><span class="brand-icon">N</span><h1>De webshop kon niet starten</h1><p>${escapeHtml(error.message)}</p><button class="outline-button" onclick="location.reload()">Opnieuw laden</button></main>`;
});
