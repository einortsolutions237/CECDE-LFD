import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDocs, getDoc, query, collection, where, writeBatch, arrayUnion, increment, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserPlus, Eye, EyeOff, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import toast from 'react-hot-toast';

export default function Register() {
  const [searchParams] = useSearchParams();
  const refCode = searchParams.get('ref') || '';
  
  const [formData, setFormData] = useState({
    fullName: '', email: '', phoneNumber: '', password: '', referralCode: refCode
  });
  
  const [emailError, setEmailError] = useState('');
  
  const validateEmail = (val: string) => {
    setFormData({...formData, email: val});
    if (!val) {
      setEmailError('');
      return;
    }
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    setEmailError(isValid ? '' : 'Please enter a valid email address');
  };

  const calculatePasswordStrength = (pass: string) => {
    if (!pass) return 0;
    let score = 0;
    if (pass.length >= 8) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;
    return score;
  };
  
  const passwordStrength = calculatePasswordStrength(formData.password);
  
  const getPasswordStrengthColor = () => {
    if (formData.password.length === 0) return 'bg-border';
    if (passwordStrength <= 1) return 'bg-destructive';
    if (passwordStrength === 2) return 'bg-orange-500';
    if (passwordStrength === 3) return 'bg-blue-500';
    return 'bg-success';
  };
  
  const getPasswordStrengthLabel = () => {
    if (formData.password.length === 0) return '';
    if (passwordStrength <= 1) return 'Weak';
    if (passwordStrength === 2) return 'Fair';
    if (passwordStrength === 3) return 'Good';
    return 'Strong';
  };

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const [sponsorData, setSponsorData] = useState<{ uid: string, fullName: string, rank: string, teamName?: string, teamId?: string } | null>(null);
  const [sponsorError, setSponsorError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  React.useEffect(() => {
    const checkReferral = async () => {
      const code = formData.referralCode?.trim();
      if (!code) {
        setSponsorData(null);
        setSponsorError('A referral code is required to register.');
        return;
      }
      setIsValidating(true);
      setSponsorError('');
      try {
        const q = query(collection(db, 'users'), where('referralCode', '==', code));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
          setSponsorData(null);
          setSponsorError('Invalid referral code. Please check your link.');
        } else {
          const sponsorDoc = querySnapshot.docs[0];
          const spData = sponsorDoc.data();
          
          let teamName = '';
          if (spData.teamId) {
            try {
               const teamDoc = await getDoc(doc(db, 'teams', spData.teamId));
               if (teamDoc.exists()) {
                 teamName = teamDoc.data().name;
               }
            } catch(e) {}
          }
          
          let roleTypeTeamName = '';
          if (spData.roleType === 'team_leader') {
            if (teamName) {
              roleTypeTeamName = teamName;
            } else {
              roleTypeTeamName = `${spData.fullName}'s Team`;
            }
          }

          setSponsorData({
            uid: sponsorDoc.id,
            fullName: spData.fullName,
            rank: spData.currentRank || 'Member',
            teamName: roleTypeTeamName,
            teamId: spData.teamId
          });
        }
      } catch (err: any) {
         setSponsorError('Error validating referral code.');
         handleFirestoreError(err, OperationType.GET, 'users');
      } finally {
        setIsValidating(false);
      }
    };

    const timeoutId = setTimeout(() => {
      checkReferral();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [formData.referralCode]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (emailError) {
      setError('Please provide a valid email structure before submitting.');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (!sponsorData) {
      setError('A valid referral code is required to create an account.');
      return;
    }

    setLoading(true);

    try {
      // First re-fetch full sponsor data to resolve team mapping
      const sponsorDocRef = doc(db, 'users', sponsorData.uid);
      const sponsorSnapshot = await getDoc(sponsorDocRef);
      if (!sponsorSnapshot.exists()) throw new Error("Sponsor not found");
      const fullSponsorData = sponsorSnapshot.data();
      
      // If the sponsor is explicitly a Team Leader, inherit their team.
      // Exceptions: If sponsor is not a Team Leader, we don't associate the new user with their team.
      let newTeamId = 'SYSTEM';
      if (fullSponsorData.teamId) {
        newTeamId = fullSponsorData.teamId;
      }

      // Create auth user
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      // Generate a unique referral code for this user
      const newRefCode = formData.fullName.replace(/\s+/g, '').substring(0, 4).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();

      const batch = writeBatch(db);

      const userRef = doc(db, 'users', user.uid);
      batch.set(userRef, {
        fullName: formData.fullName,
        email: formData.email,
        phoneNumber: formData.phoneNumber,
        referralCode: newRefCode,
        sponsorId: sponsorData.uid,
        sponsorReferralCode: formData.referralCode,
        teamId: newTeamId,
        roleType: 'team_member',
        directReferralsCount: 0,
        totalDownlineCount: 0,
        currentRank: 'Member',
        walletBalance: 0,
        role: 'member',
        accountStatus: 'active',
        activityState: 'dormant',
        createdAt: serverTimestamp()
      });

      const networkRef = doc(db, 'network', user.uid);
      batch.set(networkRef, {
        sponsorId: sponsorData.uid,
        directReferrals: [],
        totalDownlineCount: 0,
        activeDownlineCount: 0,
        levelDepth: 1
      });

      await batch.commit();

      navigate('/dashboard');
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('User already exists. Sign in?');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Network Error: Please check your connection or disable any adblockers/VPNs that might be blocking the registration.');
      } else if (err.message && err.message.includes('the client is offline')) {
        setError("Could not connect to database. Please ensure Cloud Firestore is enabled in your Firebase console.");
      } else {
        setError(err.message || 'Registration failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="mb-6 mt-4 text-center flex flex-col items-center justify-center gap-1">
        <img src="https://i.imgur.com/Adh2bcY.png" alt="CECDE Logo" className="w-20 h-20 md:w-24 md:h-24 object-contain filter drop-shadow-sm transition-transform hover:scale-105 duration-300" />
        <div className="text-xl md:text-3xl font-bold tracking-tight tracking-[-0.02em] select-none">
          <span className="text-primary text-[#6C3BAA]">CECDE</span>
        </div>
      </div>
      <div className="card w-full max-w-md p-8 md:p-10 mb-8">
        <div className="flex flex-col mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Create Account</h1>
          <p className="text-muted-foreground text-sm mt-1">Join the premier MLM platform</p>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive border border-destructive/20 text-sm p-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-foreground">Full Name</label>
            <input 
              type="text" required
              className="input-field"
              value={formData.fullName}
              onChange={e => setFormData({...formData, fullName: e.target.value})}
            />
          </div>
          
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-foreground">Email Address</label>
            <input 
              type="email" required
              className={`input-field ${emailError ? 'border-destructive focus:ring-destructive' : ''}`}
              value={formData.email}
              onChange={e => validateEmail(e.target.value)}
            />
            <AnimatePresence>
              {emailError && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-xs text-destructive mt-1 font-medium"
                >
                  {emailError}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-foreground">Phone Number</label>
            <input 
              type="tel" required
              className="input-field"
              value={formData.phoneNumber}
              onChange={e => setFormData({...formData, phoneNumber: e.target.value})}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-foreground">Password</label>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} required minLength={8}
                className="input-field pl-4 pr-10"
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            
            <AnimatePresence>
              {formData.password.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2 space-y-2 overflow-hidden"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-muted-foreground">Password strength</span>
                    <span className={`font-bold ${
                      passwordStrength <= 1 ? 'text-destructive' :
                      passwordStrength === 2 ? 'text-orange-500' :
                      passwordStrength === 3 ? 'text-blue-500' : 'text-success'
                    }`}>{getPasswordStrengthLabel()}</span>
                  </div>
                  <div className="flex gap-1 h-1.5 w-full">
                    {[1, 2, 3, 4].map((i) => (
                      <div 
                        key={i} 
                        className={`h-full flex-1 rounded-full transition-colors duration-300 ${
                           i <= passwordStrength ? getPasswordStrengthColor() : 'bg-muted'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-1 mt-1 text-[10px] sm:text-xs">
                    <div className={`flex items-center gap-1 ${formData.password.length >= 8 ? 'text-success' : 'text-muted-foreground'}`}>
                      {formData.password.length >= 8 ? <Check className="w-3 h-3"/> : <X className="w-3 h-3" />}
                      8+ characters
                    </div>
                    <div className={`flex items-center gap-1 ${/[A-Z]/.test(formData.password) ? 'text-success' : 'text-muted-foreground'}`}>
                      {/[A-Z]/.test(formData.password) ? <Check className="w-3 h-3"/> : <X className="w-3 h-3" />}
                      Uppercase
                    </div>
                    <div className={`flex items-center gap-1 ${/[0-9]/.test(formData.password) ? 'text-success' : 'text-muted-foreground'}`}>
                      {/[0-9]/.test(formData.password) ? <Check className="w-3 h-3"/> : <X className="w-3 h-3" />}
                      Number
                    </div>
                    <div className={`flex items-center gap-1 ${/[^A-Za-z0-9]/.test(formData.password) ? 'text-success' : 'text-muted-foreground'}`}>
                      {/[^A-Za-z0-9]/.test(formData.password) ? <Check className="w-3 h-3"/> : <X className="w-3 h-3" />}
                      Special char
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="space-y-1.5 p-4 bg-muted/30 border border-border rounded-xl">
            <label className="block text-sm font-semibold text-foreground text-center">Referral Code</label>
            <input 
              type="text"
              required
              placeholder="ENTER SPONSOR CODE"
              className="input-field text-center uppercase tracking-widest font-mono bg-card py-3"
              value={formData.referralCode}
              onChange={e => setFormData({...formData, referralCode: e.target.value.toUpperCase()})}
            />
            
            {/* Sponsor Validation UI */}
            <div className="mt-2 text-sm">
              {isValidating ? (
                <span className="text-muted-foreground flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                  Validating code...
                </span>
              ) : sponsorData ? (
                <div className="flex flex-col">
                  <span className="text-success flex items-center gap-2 font-medium">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                    Invited by: {sponsorData.fullName} <span className="bg-primary/10 text-primary text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ml-1">{sponsorData.rank}</span>
                  </span>
                  {sponsorData.teamName && (
                     <span className="text-primary flex items-center gap-2 font-medium text-xs mt-1">
                       <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                       Assigned to Team: {sponsorData.teamName}
                     </span>
                  )}
                </div>
              ) : sponsorError ? (
                <span className="text-destructive flex items-center gap-2 text-xs">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  {sponsorError}
                </span>
              ) : null}
            </div>
          </div>
          
          <button 
            type="submit" 
            disabled={loading || !sponsorData}
            className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:opacity-90 hover:shadow-md transition-all mt-6 disabled:opacity-50 text-sm disabled:cursor-not-allowed"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-muted-foreground border-t border-border pt-6">
          Already have an account? <Link to="/login" className="text-primary hover:underline font-bold">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
