import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

// Firebase web-config is zichtbaar in de browser. Beveilig je data met
// Firebase Authentication en database.rules.json; zet hier nooit secrets.
const firebaseConfig = {
  apiKey: "AIzaSyCBLpFJIC0yppKjQAwazMqv9QC0X4MBNaI",
  authDomain: "webshop-3cf70.firebaseapp.com",
  databaseURL: "https://webshop-3cf70-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "webshop-3cf70",
  storageBucket: "webshop-3cf70.firebasestorage.app",
  messagingSenderId: "253002374669",
  appId: "1:253002374669:web:3058a5c9b2d4f111503f44",
  measurementId: "G-7YTVRGHRKL"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

isSupported().then((supported) => {
  if (supported) getAnalytics(app);
}).catch(() => {});
