# NOIR webshop

Professionele donkere webshop met eigen accountregistratie, eigen login en één apart sitebeheeraccount. De frontend kan op GitHub Pages worden gehost; Firebase Realtime Database en Firebase Functions verzorgen de beveiligde backend.

## Belangrijk: authenticatie

Deze versie gebruikt **geen Firebase Authentication**. Klantaccounts worden in Firebase Realtime Database opgeslagen met per account een scrypt-gehashte wachtwoordwaarde en unieke salt. Inloggen, registreren en productbeheer lopen via Firebase Cloud Functions. De database is voor rechtstreekse browsertoegang volledig gesloten.

## 1. Sitebeheeraccount instellen

Open `functions/admin-config.js` en wijzig:

- `username`: de enige beheerdersnaam.
- `password`: een lang, uniek beheerderswachtwoord.
- `sessionSecret`: een andere lange, willekeurige geheime sleutel.

Dit bestand staat bewust in `.gitignore`. **Commit of upload dit bestand nooit naar GitHub.** Bewaar een eigen kopie. De voorbeeldversie staat in `functions/admin-config.example.js`.

De beheerlogin is apart van klantregistratie. Klanten kunnen geen beheerdersrol kiezen of een tweede beheeraccount registreren.

## 2. Backend installeren en publiceren

Vereist: Node.js 20+, Firebase CLI en toegang tot het Firebase-project `webshop-3cf70`.

```bash
npm install
cd functions
npm install
cd ..
firebase login
firebase use webshop-3cf70
firebase deploy --only database,functions
```

De Functions-code heeft `functions/admin-config.js` nodig. Maak eerst je eigen geheime waarden aan zoals hierboven beschreven. Publiceer de Functions uitsluitend vanuit je eigen vertrouwde computer.

## 3. Frontend lokaal testen

```bash
npm install
npm run dev
```

## 4. GitHub Pages

De frontend gebruikt Vite. Voor een repository die op `https://GEBRUIKER.github.io/REPOSITORY/` staat, stel je eventueel `base: "/REPOSITORY/"` in `vite.config.js` in (of maak dat bestand aan). Bouw daarna:

```bash
npm run build
```

Publiceer de inhoud van `dist/` via GitHub Pages. De API blijft op Firebase Functions draaien; GitHub Pages voert zelf geen backendcode uit.

## 5. Databasebeveiliging

`database.rules.json` blokkeert alle directe lees- en schrijfacties vanuit browsers. De Firebase Admin SDK in Cloud Functions kan de database veilig beheren. Verander deze regels niet naar publieke lees- of schrijfrechten.

## Wat is inbegrepen

- Donkere, schermvullende NOIR-webshopstijl.
- Productoverzicht, categorieën, zoeken en winkelwagen.
- Zelf account aanmaken en inloggen.
- Eén apart sitebeheeraccount dat lokaal in `functions/admin-config.js` wordt ingesteld.
- Producten toevoegen en verwijderen via beveiligde backendroutes.

Er is nog geen betaalprovider of verzend-/orderafhandeling gekoppeld. De winkelwagen is dus een productselectie en geen afgeronde betaalcheckout.
