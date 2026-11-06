import "./style.css";
import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, sendEmailVerification, reload
} from "firebase/auth";
import {
  ref, onValue, push, set, remove, query, orderByChild
} from "firebase/database";
import { getFunctions, httpsCallable } from "firebase/functions";

const functions = getFunctions(undefined, "europe-west1");
const bootstrapAdmin = httpsCallable(functions, "bootstrapAdmin");
const appRoot = document.querySelector("#app");

let currentUser = null;
let products = [];
let cart = [];
let adminMode = false;
let stopProducts = null;
let activeCategory = "Alles";

const money = (n) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(n || 0));
const safe = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const categories = () => ["Alles", ...new Set(products.map(p => p.category).filter(Boolean))];

function header() {
  return `
    <header class="topbar">
      <a class="brand" href="#" aria-label="Webshop home"><span class="brand-mark">w</span> webshop</a>
      <label class="search"><span>⌕</span><input id="search" placeholder="Waar ben je naar op zoek?" /></label>
      <nav>
        ${currentUser ? `<span class="user-label">${safe(currentUser.email)}</span><button class="nav-button" id="admin-toggle">Sitebeheer</button><button class="nav-button" id="logout">Uitloggen</button>` : `<button class="nav-button" id="account-open">Inloggen</button>`}
        <button class="cart-button" id="cart-open">Winkelwagen <b>${cart.length}</b></button>
      </nav>
    </header>`;
}

function render() {
  if (!currentUser) {
    appRoot.innerHTML = `${header()}
      <main class="gate">
        <section class="gate-card">
          <p class="eyebrow">WELKOM IN ONZE WEBSHOP</p>
          <h1>Maak eerst een account aan</h1>
          <p>Om producten te bekijken en de winkelwagen te gebruiken, log je in of registreer je met je e-mailadres en wachtwoord.</p>
          <button class="primary" id="gate-account">Inloggen of account aanmaken</button>
        </section>
      </main>
      <footer><span>webshop</span><span>Een onafhankelijke demo-webshop</span></footer>
      <div id="modal-root"></div>`;
    bindMain();
    document.querySelector("#gate-account").onclick = accountModal;
    return;
  }
  const visible = products.filter(p =>
    (activeCategory === "Alles" || p.category === activeCategory) &&
    (`${p.name} ${p.description} ${p.category}`.toLowerCase().includes((document.querySelector("#search")?.value || "").toLowerCase()))
  );
  appRoot.innerHTML = `${header()}
    <main>
      <section class="hero">
        <div><p class="eyebrow">ONTDEK ONZE COLLECTIE</p><h1>Alles wat je zoekt.<br><span>Gewoon online.</span></h1><p>Bekijk het aanbod en vind jouw volgende favoriet.</p><a href="#producten" class="hero-link">Bekijk producten ↓</a></div>
        <div class="hero-art"><div class="art-circle"></div><div class="art-card">★<br><small>Jouw favorieten<br>op één plek</small></div></div>
      </section>
      <section id="producten" class="products-section">
        <div class="section-heading"><div><p class="eyebrow">ONS AANBOD</p><h2>Populaire producten</h2></div><span class="muted">${visible.length} producten</span></div>
        <div class="categories">${categories().map(c => `<button class="chip ${activeCategory === c ? "selected" : ""}" data-category="${safe(c)}">${safe(c)}</button>`).join("")}</div>
        <div class="product-grid">${visible.length ? visible.map(productCard).join("") : `<div class="empty">Er staan nog geen producten in deze categorie.</div>`}</div>
      </section>
    </main>
    <footer><span>webshop</span><span>Een onafhankelijke demo-webshop</span></footer>
    <div id="modal-root"></div>`;
  bindMain();
}

function productCard(p) {
  return `<article class="product-card">
    <div class="product-image">${p.image ? `<img src="${safe(p.image)}" alt="${safe(p.name)}" loading="lazy" onerror="this.parentElement.innerHTML='📦'">` : "📦"}
      ${p.category ? `<span class="product-category">${safe(p.category)}</span>` : ""}
    </div>
    <div class="product-info"><h3>${safe(p.name)}</h3><p>${safe(p.description || "Een mooi product uit onze collectie.")}</p>
      <div class="product-bottom"><strong>${money(p.price)}</strong><button class="add-button" data-add="${safe(p.id)}">＋</button></div></div>
  </article>`;
}

function bindMain() {
  document.querySelector("#search")?.addEventListener("input", () => {
    const value = document.querySelector("#search").value;
    render();
    const search = document.querySelector("#search");
    search.value = value;
    search.focus();
    search.setSelectionRange(value.length, value.length);
  });
  document.querySelectorAll("[data-category]").forEach(b => b.onclick = () => { activeCategory = b.dataset.category; render(); });
  document.querySelectorAll("[data-add]").forEach(b => b.onclick = () => {
    const p = products.find(x => x.id === b.dataset.add);
    if (p) { cart.push(p); render(); toast(`${p.name} toegevoegd aan je winkelwagen`); }
  });
  document.querySelector("#account-open")?.addEventListener("click", accountModal);
  document.querySelector("#logout")?.addEventListener("click", () => signOut(auth));
  document.querySelector("#admin-toggle")?.addEventListener("click", () => { adminMode = !adminMode; adminMode ? adminPanel() : render(); });
  document.querySelector("#cart-open")?.addEventListener("click", cartModal);
}

function accountModal() {
  const root = document.querySelector("#modal-root");
  root.innerHTML = `<div class="overlay"><section class="modal"><button class="close" id="close">×</button><p class="eyebrow">JOUW ACCOUNT</p><h2>Welkom</h2><p class="muted">Maak een account aan of log in met je e-mailadres en wachtwoord.</p>
    <form id="auth-form"><label>E-mailadres<input type="email" id="email" required autocomplete="email"></label><label>Wachtwoord<input type="password" id="password" required minlength="6" autocomplete="current-password"></label>
    <button class="primary full" type="submit" id="login-submit">Inloggen</button><button class="secondary full" type="button" id="signup">Account aanmaken</button><p id="auth-message" class="form-message"></p></form></section></div>`;
  root.querySelector("#close").onclick = () => root.innerHTML = "";
  root.querySelector("#auth-form").onsubmit = async e => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, root.querySelector("#email").value, root.querySelector("#password").value);
      root.innerHTML = "";
    } catch (err) { root.querySelector("#auth-message").textContent = authError(err); }
  };
  root.querySelector("#signup").onclick = async () => {
    try {
      const credential = await createUserWithEmailAndPassword(auth, root.querySelector("#email").value, root.querySelector("#password").value);
      await sendEmailVerification(credential.user);
      root.querySelector("#auth-message").textContent = "Account aangemaakt. Controleer je inbox om je e-mailadres te bevestigen.";
    } catch (err) { root.querySelector("#auth-message").textContent = authError(err); }
  };
}

function adminPanel() {
  const root = document.querySelector("#modal-root");
  root.innerHTML = `<div class="overlay"><section class="modal admin-modal"><button class="close" id="close">×</button><p class="eyebrow">SITEBEHEER</p><h2>Producten beheren</h2>
    ${currentUser && !currentUser.emailVerified ? `<div class="notice">Bevestig eerst je e-mailadres. Ververs daarna je accountstatus door opnieuw in te loggen.</div>` : ""}
    <div id="admin-content"></div></section></div>`;
  root.querySelector("#close").onclick = () => { root.innerHTML = ""; adminMode = false; };
  const content = root.querySelector("#admin-content");
  if (!currentUser) return;
  currentUser.getIdTokenResult(true).then(token => {
    if (token.claims.admin === true) {
      content.innerHTML = `<form id="product-form" class="product-form">
        <label>Productnaam<input id="p-name" required maxlength="90"></label>
        <label>Prijs in euro<input id="p-price" type="number" min="0" step="0.01" required></label>
        <label>Categorie<input id="p-category" required maxlength="40" placeholder="Bijv. Elektronica"></label>
        <label>Afbeeldings-URL (optioneel)<input id="p-image" type="url" placeholder="https://..."></label>
        <label class="wide">Beschrijving<textarea id="p-description" maxlength="500"></textarea></label>
        <button class="primary wide" type="submit">Product toevoegen</button></form>
        <h3 class="list-title">Bestaande producten</h3><div class="admin-list">${products.map(p => `<div><span><b>${safe(p.name)}</b><small>${money(p.price)} · ${safe(p.category)}</small></span><button class="delete-button" data-delete="${safe(p.id)}">Verwijderen</button></div>`).join("") || "<p class='muted'>Nog geen producten.</p>"}</div>`;
      content.querySelector("#product-form").onsubmit = async e => {
        e.preventDefault();
        const product = {
          name: content.querySelector("#p-name").value.trim(),
          price: Number(content.querySelector("#p-price").value),
          category: content.querySelector("#p-category").value.trim(),
          image: content.querySelector("#p-image").value.trim(),
          description: content.querySelector("#p-description").value.trim(),
          createdAt: Date.now()
        };
        if (!product.name || !Number.isFinite(product.price) || product.price < 0) return;
        try { await push(ref(db, "products"), product); toast("Product toegevoegd"); adminPanel(); }
        catch (err) { toast(authError(err)); }
      };
      content.querySelectorAll("[data-delete]").forEach(b => b.onclick = async () => {
        if (confirm("Weet je zeker dat je dit product wilt verwijderen?")) {
          try { await remove(ref(db, `products/${b.dataset.delete}`)); toast("Product verwijderd"); adminPanel(); }
          catch (err) { toast(authError(err)); }
        }
      });
    } else {
      content.innerHTML = `<div class="notice">Er is nog geen sitebeheerder ingesteld, of dit account heeft geen beheerdersrechten.</div>
        <p>Eenmalige eerste inrichting: maak eerst een account aan en bevestig het e-mailadres. Vul daarna de geheime bootstrap-code in die je bij de Firebase Functions-installatie hebt ingesteld.</p>
        <form id="bootstrap-form"><label>Eenmalige bootstrap-code<input id="bootstrap-secret" type="password" required autocomplete="off"></label><button class="primary full">Maak mij sitebeheerder</button><p id="bootstrap-message" class="form-message"></p></form>`;
      content.querySelector("#bootstrap-form").onsubmit = async e => {
        e.preventDefault();
        const msg = content.querySelector("#bootstrap-message");
        try {
          await reload(currentUser);
          if (!currentUser.emailVerified) throw new Error("Verifieer eerst je e-mailadres en log opnieuw in.");
          await bootstrapAdmin({ secret: content.querySelector("#bootstrap-secret").value });
          await currentUser.getIdToken(true);
          msg.textContent = "Sitebeheer is geactiveerd. Open Sitebeheer opnieuw.";
          toast("Beheerdersrechten ingesteld");
        } catch (err) { msg.textContent = authError(err); }
      };
    }
  }).catch(err => { content.textContent = authError(err); });
}

function cartModal() {
  const root = document.querySelector("#modal-root");
  const total = cart.reduce((sum, p) => sum + Number(p.price || 0), 0);
  root.innerHTML = `<div class="overlay"><section class="modal"><button class="close" id="close">×</button><p class="eyebrow">JOUW SELECTIE</p><h2>Winkelwagen</h2>
    ${cart.length ? cart.map((p, i) => `<div class="cart-line"><span>${safe(p.name)}</span><b>${money(p.price)}</b><button data-remove="${i}">×</button></div>`).join("") : `<p class="muted">Je winkelwagen is nog leeg.</p>`}
    <div class="cart-total"><span>Totaal</span><strong>${money(total)}</strong></div><p class="muted small">Dit is een demo-webshop; afrekenen en betalingen zijn niet ingeschakeld.</p></section></div>`;
  root.querySelector("#close").onclick = () => root.innerHTML = "";
  root.querySelectorAll("[data-remove]").forEach(b => b.onclick = () => { cart.splice(Number(b.dataset.remove), 1); cartModal(); render(); });
}

function toast(message) {
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = message; document.body.append(el);
  setTimeout(() => el.remove(), 2800);
}
function authError(err) {
  const code = err?.code || "";
  const map = {
    "auth/email-already-in-use": "Dit e-mailadres heeft al een account.",
    "auth/invalid-email": "Dit e-mailadres is ongeldig.",
    "auth/weak-password": "Kies een wachtwoord van minimaal 6 tekens.",
    "auth/invalid-credential": "E-mailadres of wachtwoord is onjuist.",
    "auth/too-many-requests": "Te veel pogingen. Probeer het later opnieuw.",
    "functions/failed-precondition": "De eerste beheerder is al ingesteld.",
    "functions/permission-denied": "Geen toegang. Controleer je bootstrap-code."
  };
  return map[code] || err?.message || "Er ging iets mis.";
}

onAuthStateChanged(auth, user => {
  currentUser = user;
  if (stopProducts) stopProducts();
  stopProducts = onValue(query(ref(db, "products"), orderByChild("createdAt")), snapshot => {
    products = [];
    snapshot.forEach(child => products.push({ id: child.key, ...child.val() }));
    products.reverse();
    render();
    if (adminMode && document.querySelector("#admin-content")) adminPanel();
  }, error => {
    console.error(error);
    toast("Producten laden is niet gelukt. Controleer de Firebase Database Rules.");
  });
});
