# Webshop – Firebase + GitHub

Een responsive Nederlandstalige demo-webshop met Firebase Authentication, Realtime Database en een sitebeheeromgeving. De vormgeving is een eigen ontwerp met een blauwe marketplace-uitstraling; dit is geen officiële bol.com-webshop.

## Wat zit erin?
- Bezoekers moeten een account aanmaken of inloggen voordat ze de winkel gebruiken.
- Registratie met e-mailadres en wachtwoord (minimaal 6 tekens).
- E-mailverificatie bij registratie.
- Producten worden live uit Firebase Realtime Database geladen.
- Sitebeheerder kan producten toevoegen en verwijderen.
- Database-regels staan schrijven alleen toe aan een account met de beveiligde `admin` custom claim.
- Winkelwagen als demo; geen betaal- of bestelverwerking.

## 1. Firebase voorbereiden
Dit project is al gekoppeld aan Firebase-project `webshop-3cf70`.
Controleer in Firebase Console:
1. Authentication → Sign-in method → **E-mail/wachtwoord** inschakelen.
2. Authentication → Settings → Authorized domains: voeg je GitHub Pages- of eigen domein toe als je dat gebruikt.
3. Realtime Database moet actief zijn in `europe-west1`.

De Firebase webconfig staat in `src/firebase.js`. De API-key voor Firebase web-apps is geen servergeheim. Beveiliging komt uit Authentication, database-regels en eventuele App Check.

## 2. Lokaal starten
Vereist Node.js 20 of nieuwer en Firebase CLI.

```bash
npm install
npm run dev
```

## 3. Firebase CLI en eerste deployment
```bash
npm install -g firebase-tools
firebase login
firebase use webshop-3cf70
npm install --prefix functions
firebase functions:secrets:set BOOTSTRAP_SECRET
```

Kies bij de laatste opdracht een lange, unieke bootstrap-code. Bewaar die veilig; commit deze code nooit naar GitHub.

Deploy:
```bash
npm run deploy
```

De eerste deploy van Cloud Functions kan vragen om het Blaze-abonnement (facturering) en om API's in Google Cloud in te schakelen. Controleer eventuele kosten voordat je dit activeert.

## 4. Eerste sitebeheerder instellen
1. Open de gedeployde webshop.
2. Maak een account aan met het e-mailadres dat je als beheerder wilt gebruiken.
3. Klik op de verificatielink in je e-mail.
4. Log opnieuw in zodat Firebase de verificatiestatus vernieuwt.
5. Klik op **Sitebeheer**.
6. Vul de bootstrap-code in die je bij `BOOTSTRAP_SECRET` hebt ingesteld.
7. De eerste account krijgt een admin custom claim. Log uit en opnieuw in als Sitebeheer niet meteen zichtbaar is.

De bootstrap-functie accepteert maar één eerste beheerder. Daarna is de code niet opnieuw bruikbaar om extra beheerders aan te maken. Extra beheerders kun je later veilig via Firebase Admin SDK/Console beheren door custom claims toe te kennen.

## 5. GitHub gebruiken
Je kunt alle bestanden naar een GitHub-repository uploaden. Voor automatisch deployen kun je Firebase Hosting koppelen aan GitHub via Firebase Console → Hosting → Get started → GitHub. Zet nooit `BOOTSTRAP_SECRET`, service-account JSON of andere servergeheimen in je repository.

**Let op GitHub Pages:** deze app gebruikt Firebase Hosting-configuratie en Cloud Functions. Gebruik bij voorkeur Firebase Hosting. GitHub kan de broncode hosten; Firebase verzorgt de live website, database en functies.

## Beveiliging en productie
- Stel Firebase App Check in voordat je de site publiek gebruikt.
- Voeg betaalverwerking, voorraadbeheer, orderverwerking en privacy-/cookie-informatie afzonderlijk toe voordat je echte bestellingen accepteert.
- Publieke product-read is bewust ingeschakeld; alle productwrites zijn server-side afgedwongen via de admin custom claim.
- Test de regels met Firebase Rules Playground of Emulator Suite.
- Pas de e-mailtemplates en domeinen aan in Firebase Console.
