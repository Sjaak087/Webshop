const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getAuth } = require("firebase-admin/auth");

initializeApp();
const bootstrapSecret = defineSecret("BOOTSTRAP_SECRET");

exports.bootstrapAdmin = onCall(
  { region: "europe-west1", secrets: [bootstrapSecret], enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Log eerst in.");
    if (!request.auth.token.email_verified) {
      throw new HttpsError("failed-precondition", "Bevestig eerst je e-mailadres.");
    }
    if (!request.data || request.data.secret !== bootstrapSecret.value()) {
      throw new HttpsError("permission-denied", "Bootstrap-code onjuist.");
    }

    const db = getDatabase();
    const adminRef = db.ref("_system/initialAdminUid");
    const result = await adminRef.transaction(current => current === null ? request.auth.uid : undefined);
    if (!result.committed) {
      throw new HttpsError("failed-precondition", "De eerste beheerder is al ingesteld.");
    }

    await getAuth().setCustomUserClaims(request.auth.uid, { admin: true });
    return { success: true };
  }
);
