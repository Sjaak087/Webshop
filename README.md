# NOIR — professionele webshop

Een opnieuw opgebouwde, volledig donkere webshop. De websitebestanden in `site/` zijn gewone HTML, CSS en JavaScript-modules. Er is geen Vite-build of frontend-installatie nodig: GitHub Pages kan de websitebestanden rechtstreeks publiceren.

De accounts, login en productbeheer lopen via Firebase Cloud Functions en Firebase Realtime Database. Er wordt **geen Firebase Authentication** gebruikt.

## Inbegrepen

- Professionele, responsieve donkere webshop.
- Producten bekijken, zoeken en filteren op categorie.
- Winkelwagen die op het apparaat wordt bewaard.
- Zelf een klantaccount registreren met e-mailadres en wachtwoord.
- Eigen login via de API; wachtwoorden worden op de server met scrypt en een unieke salt gehasht.
- Eén sitebeheeraccount, apart ingesteld in een backendbestand.
- Alleen sitebeheer kan producten toevoegen en verwijderen.
- Database is standaard gesloten voor rechtstreekse browsertoegang.
- GitHub Actions publiceert automatisch de frontend vanuit `site/`.

**Nog niet aangesloten:** online betalen, verzendkosten, bestellingen plaatsen en orderverwerking. De winkelwagen bewaart voorlopig alleen de gekozen producten.

## 1. Het enige sitebeheeraccount instellen

Kopieer `functions/admin-config.example.js` naar `functions/admin-config.js`. Open daarna het nieuwe bestand en stel de drie waarden in:

```js
module.exports = {
  username: "jouw-beheerdersnaam",
  password: "een-lang-uniek-wachtwoord",
  sessionSecret: "een-aparte-willekeurige-sleutel-van-minimaal-32-tekens"
};
```

Gebruik een uniek wachtwoord en een aparte geheime sleutel van minimaal 32 tekens. Laat geen `VERVANG-DIT`-waarden staan. Op de website kan de beheerder via **Inloggen** aanmelden met deze beheerdersnaam en dit wachtwoord.

**Deel `functions/admin-config.js` nooit via GitHub.** Het bestand staat in `.gitignore` en moet alleen lokaal op de computer staan waarmee je de backend publiceert. De Firebase-deployconfiguratie neemt dit lokale bestand mee naar de backend; het staat niet in `site/` en komt dus nooit in de publieke websitebestanden terecht. Zorg dat je het bestand lokaal hebt aangemaakt vóór je de Functions publiceert.

## 2. Firebase-backend installeren en publiceren

Vereist: Node.js 22, npm en de Firebase CLI. Voor het publiceren van Firebase Cloud Functions moet het Firebase-project op het Blaze-abonnement staan. Dat betekent dat er een factureringsaccount aan het project gekoppeld moet zijn; laat de projectbeheerder/een volwassene dit regelen en stel vooraf budgetwaarschuwingen in. Firebase vermeldt een maandelijkse kosteloze gebruiksruimte, maar overschrijdingen en bepaalde opslag/deploykosten kunnen worden berekend. Open daarna een terminal in de hoofdmap van het project:

```bash
cd functions
npm install
cd ..
firebase login
firebase use webshop-3cf70
firebase deploy --only database,functions
```

De projectnaam is al ingevuld in `.firebaserc`. Maak eerst je lokale bestand `functions/admin-config.js` zoals hierboven beschreven.

Na publiceren kun je de API testen via:

`https://europe-west1-webshop-3cf70.cloudfunctions.net/api/health`

De server geeft JSON terug met `"ok": true`. Controleer ook of `"adminConfigured": true` staat. Zo niet, controleer dan de drie instellingen in `functions/admin-config.js` en publiceer de Functions opnieuw.

De Firebase Realtime Database moet voor dit project bestaan. De regels in `database.rules.json` blokkeren alle directe browsertoegang; de Cloud Function gebruikt de Firebase Admin SDK om gegevens te lezen en te wijzigen.

## 3. Frontend publiceren op GitHub Pages

1. Upload de projectmap naar je GitHub-repository en push de bestanden naar de branch `main`.
2. Open **Settings → Pages** in je GitHub-repository.
3. Kies onder **Build and deployment → Source** voor **GitHub Actions**.
4. De workflow `.github/workflows/deploy-pages.yml` publiceert automatisch uitsluitend de bestanden uit `site/`.
5. Open het resultaat vanuit **Actions** of via de GitHub Pages-link bij Settings → Pages.

De frontend gebruikt relatieve verwijzingen zoals `./src/main.js`. Daardoor werkt hij ook als je GitHub Pages-site onder `https://gebruikersnaam.github.io/repositorynaam/` staat. Je hoeft geen bronmap `src` rechtstreeks als publicatiemap te kiezen: de workflow publiceert de volledige `site`-map.

Gebruik je een andere branch dan `main`, wijzig dan `branches: [main]` in `.github/workflows/deploy-pages.yml`.

## 4. API-adres aanpassen

Het API-adres staat in `site/src/config.js`:

`https://europe-west1-webshop-3cf70.cloudfunctions.net/api`

Verander dit alleen wanneer je de Firebase Function naar een ander project of een andere regio verplaatst. Het adres eindigt op `/api`.

## 5. Foutmeldingen oplossen

- **404 op `main.js`, `style.css` of `favicon.svg`:** controleer of GitHub Pages de workflow heeft uitgevoerd en of de volledige map `site/` als artifact is gepubliceerd. De HTML verwijst naar relatieve paden.
- **404 op `/api/products`:** publiceer de backend met `firebase deploy --only functions` en controleer het API-adres in `site/src/config.js`.
- **Registreren of inloggen mislukt:** controleer of Firebase Realtime Database bestaat en of de Functions zijn gepubliceerd.
- **Beheerlogin werkt niet:** controleer `functions/admin-config.js`; er kan maar één ingestelde sitebeheerlogin zijn.

## 6. Lokale controles

De frontend kan rechtstreeks worden bekeken met een lokale statische webserver. De backend heeft eigen dependencies:

```bash
cd functions
npm install
npm run check
```

Houd wachtwoorden, sessiesleutels en `functions/admin-config.js` privé.
