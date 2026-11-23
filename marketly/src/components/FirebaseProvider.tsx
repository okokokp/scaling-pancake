import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { auth, testConnection } from '../lib/firebase.ts';
import { ensureFirebaseUserProfile } from '../lib/firestoreProducts.ts';

interface FirebaseContextValue {
  firebaseUser: User | null;
  authReady: boolean;
  dbStatus: 'checking' | 'connected' | 'offline' | 'error';
  signingIn: boolean;
  signInWithGoogle: () => Promise<User>;
  signOutFirebase: () => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextValue>({
  firebaseUser: null,
  authReady: false,
  dbStatus: 'checking',
  signingIn: false,
  signInWithGoogle: async () => {
    throw new Error('FirebaseProvider not mounted');
  },
  signOutFirebase: async () => {},
});

export const useFirebase = () => useContext(FirebaseContext);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'offline' | 'error'>('checking');
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    let mounted = true;
    testConnection().then((status) => {
      if (mounted) setDbStatus(status);
    });
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!mounted) return;
      setFirebaseUser(user);
      setAuthReady(true);
      if (user && user.emailVerified) {
        ensureFirebaseUserProfile(user, 'merchant').catch(() => {});
      }
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setSigningIn(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      if (result.user && result.user.emailVerified) {
        await ensureFirebaseUserProfile(result.user, 'merchant');
      }
      return result.user;
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOutFirebase = useCallback(async () => {
    await signOut(auth);
  }, []);

  return (
    <FirebaseContext.Provider
      value={{
        firebaseUser,
        authReady,
        dbStatus,
        signingIn,
        signInWithGoogle,
        signOutFirebase,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};
