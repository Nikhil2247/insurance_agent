import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  User
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  createdAt: Date;
}

// Register new user
export async function registerUser(email: string, password: string, name: string): Promise<UserProfile> {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  // Update display name
  await updateProfile(user, { displayName: name });

  // Create user document in Firestore
  const userProfile: UserProfile = {
    uid: user.uid,
    email: user.email || email,
    name: name,
    createdAt: new Date()
  };

  await setDoc(doc(db, 'users', user.uid), userProfile);

  return userProfile;
}

// Login user
export async function loginUser(email: string, password: string): Promise<UserProfile> {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  // Get user profile from Firestore
  const userDoc = await getDoc(doc(db, 'users', user.uid));

  if (userDoc.exists()) {
    return userDoc.data() as UserProfile;
  }

  // Fallback if no profile exists
  return {
    uid: user.uid,
    email: user.email || email,
    name: user.displayName || 'User',
    createdAt: new Date()
  };
}

// Logout user
export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

// Get current user profile
export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const user = auth.currentUser;
  if (!user) return null;

  const userDoc = await getDoc(doc(db, 'users', user.uid));

  if (userDoc.exists()) {
    return userDoc.data() as UserProfile;
  }

  return {
    uid: user.uid,
    email: user.email || '',
    name: user.displayName || 'User',
    createdAt: new Date()
  };
}

// Subscribe to auth state changes
export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export { auth };
