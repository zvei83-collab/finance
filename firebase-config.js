// Конфигурация Google Firebase
export const firebaseConfig = {
  apiKey: "AIzaSyDqM-44fUmRYUmcigsw_9fgb9yV92479Tc",
  authDomain: "financeapp-348ec.firebaseapp.com",
  projectId: "financeapp-348ec",
  storageBucket: "financeapp-348ec.firebasestorage.app",
  messagingSenderId: "1082990265997",
  appId: "1:1082990265997:web:196c22b3f3c34efa5604c4"
};

export const isFirebaseConfigured = () => {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY");
};
