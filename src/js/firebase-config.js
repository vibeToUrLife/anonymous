// Firebase configuration – this file is safe to be public in client-side apps.
// Firebase API keys are NOT secret; they only identify your project.
// Security is enforced by Firestore Security Rules (set in Firebase Console).
const firebaseConfig = {
  apiKey:            "AIzaSyAAehhBjbxeEI6s3oz39u25woNlqi4c27E",
  authDomain:        "nymous-4bce7.firebaseapp.com",
  // TODO (Boss): replace with the EXACT URL from Firebase Console → Realtime
  // Database. This Singapore value is only a placeholder/guess. Needed for the
  // Coin Rush "robbing" mode; until it's correct, robbing falls back to solo.
  databaseURL:       "https://console.firebase.google.com/project/nymous-4bce7/database/nymous-4bce7-default-rtdb/data/~2F",
  projectId:         "nymous-4bce7",
  storageBucket:     "nymous-4bce7.firebasestorage.app",
  messagingSenderId: "613451077785",
  appId:             "1:613451077785:web:570c9f65b0f2dc67134008"
};
