// Firebase Configuration
// Import the functions you need from the SDKs
// (Already loaded via script tags in index.html)

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyChCtC7oAGKYxBVGx6fT1IsJLNzQEKjm7A",
  authDomain: "project-8071305905995475903.firebaseapp.com",
  projectId: "project-8071305905995475903",
  storageBucket: "project-8071305905995475903.firebasestorage.app",
  messagingSenderId: "444071763317",
  appId: "1:444071763317:web:f28565f1375975e21f873c",
  measurementId: "G-FEXZM3H9XX"
};

if (window.firebase) {
  // Initialize Firebase
  const app = firebase.initializeApp(firebaseConfig);

  // Initialize Firebase Authentication and get a reference to the service
  const auth = typeof firebase.auth === 'function' ? firebase.auth() : null;

  // Initialize Realtime Database and get a reference to the service
  const database = typeof firebase.database === 'function' ? firebase.database() : null;

  // Initialize Firestore
  const firestore = typeof firebase.firestore === 'function' ? firebase.firestore() : null;
  window.firebaseFirestore = firestore;

  // Initialize Analytics only when supported in this environment
  let analytics = null;
  if (typeof firebase.analytics === 'function') {
    try {
      analytics = firebase.analytics();
    } catch (error) {
      console.warn('Firebase analytics unavailable in this environment.', error);
    }
  }

  // Initialize Google Auth Provider
  if (auth && firebase.auth.GoogleAuthProvider) {
    const googleProvider = new firebase.auth.GoogleAuthProvider();
    googleProvider.setCustomParameters({
      prompt: 'select_account'
    });
    window.googleProvider = googleProvider;
  }

  // Auth state observer
  if (auth) {
    firebase.auth().onAuthStateChanged((user) => {
      if (user) {
        console.log('User signed in:', user.displayName);
      } else {
        console.log('User signed out');
      }
    });
  }

  window.firebaseApp = app;
  window.firebaseAuthInstance = auth;
  window.firebaseDatabase = database;
  window.firebaseAnalytics = analytics;
  window.firebaseFirestore = firestore;

  console.log('Firebase initialized successfully!');
} else {
  console.warn('Firebase SDK failed to load. Local login will still work.');
}
