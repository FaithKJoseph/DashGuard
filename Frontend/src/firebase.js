import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
    databaseURL: "https://violation-detection-474506-default-rtdb.asia-southeast1.firebasedatabase.app/",
    projectId: "violation-detection-474506",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);