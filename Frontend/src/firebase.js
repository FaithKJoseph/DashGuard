import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail
} from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyALlLlWJB-IB0XKN0WhRcIyPMtupggLnDI",
    authDomain: "violation-detection-474506.firebaseapp.com",
    databaseURL: "https://violation-detection-474506-default-rtdb.asia-southeast1.firebasedatabase.app/",
    projectId: "violation-detection-474506",
    storageBucket: "violation-detection-474506.firebasestorage.app",
    messagingSenderId: "899148917041",
    appId: "1:899148917041:web:0c9f9cae13597b2dd12810",
    measurementId: "G-282K2NE7JY"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

// Auth helper functions
export const signUp = (email, password) =>
    createUserWithEmailAndPassword(auth, email, password);

export const signIn = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

export const logOut = () => signOut(auth);

export const onAuthChange = (callback) =>
    onAuthStateChanged(auth, callback);

export const resetPassword = (email) =>
    sendPasswordResetEmail(auth, email);