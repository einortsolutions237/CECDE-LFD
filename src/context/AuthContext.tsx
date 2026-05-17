import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';

interface UserData {
  uid: string;
  email: string;
  fullName: string;
  role: 'super_admin' | 'admin' | 'member';
  roleType?: string;
  teamId?: string;
  referralCode: string;
  sponsorId?: string;
  currentRank: string;
  walletBalance: number;
  accountStatus: 'active' | 'suspended';
}

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeSnapshot: () => void = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          
          unsubscribeSnapshot = onSnapshot(userRef, (docSnap) => {
             if (docSnap.exists()) {
               const data = docSnap.data();
               // Special override for super admin user
               if (currentUser.email?.toLowerCase() === 'njeirheinard@gmail.com') {
                 if (data.role !== 'super_admin' || data.referralCode !== 'MAXIM26') {
                   updateDoc(userRef, { role: 'super_admin', referralCode: 'MAXIM26' }).catch(console.error);
                 }
               }
               setUserData({ uid: currentUser.uid, email: currentUser.email || '', ...data } as UserData);
             } else {
               if (currentUser.email?.toLowerCase() === 'njeirheinard@gmail.com') {
                 import('firebase/firestore').then(({ setDoc }) => {
                   setDoc(userRef, {
                      fullName: 'Njei Rheinard',
                      email: 'njeirheinard@gmail.com',
                      phoneNumber: '',
                      referralCode: 'MAXIM26',
                      role: 'super_admin',
                      accountStatus: 'active',
                      currentRank: 'Diamond',
                      walletBalance: 0,
                      directReferralsCount: 0,
                      totalDownlineCount: 0,
                      createdAt: new Date()
                   }).catch(console.error);
                 });
               } else {
                 setUserData(null);
               }
             }
             setLoading(false);
          }, (error: any) => {
             console.error("Error fetching user data:", error);
             if (error.message && error.message.toLowerCase().includes('permission')) {
               alert("Permission denied. Since you connected a custom Firebase project (lfd-mlm), make sure to copy the rules from the `firestore.rules` file in this editor and deploy them in your Firebase Console under 'Firestore Database' -> 'Rules'.");
             } else if (error.message && error.message.includes('the client is offline')) {
               console.error("Please check your Firebase configuration.");
               alert("Could not connect to the database. Please ensure Cloud Firestore is enabled in your Firebase Console, or check your internet connection.");
             } else {
               handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
             }
             setLoading(false);
          });
          
        } catch (error: any) {
          console.error("Error setting up user listener:", error);
          setLoading(false);
        }
      } else {
        setUserData(null);
        setLoading(false);
        unsubscribeSnapshot();
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeSnapshot();
    };
  }, []);

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

