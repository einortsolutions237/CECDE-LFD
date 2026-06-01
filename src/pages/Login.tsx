import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { LogIn, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import LanguageSelector from '../components/LanguageSelector';
import { useTranslation } from 'react-i18next';

export default function Login() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const validateEmail = (val: string) => {
    setEmail(val);
    if (!val) {
      setEmailError('');
      return;
    }
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    setEmailError(isValid ? '' : 'Please enter a valid email address');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (emailError) {
      setError('Please fix the errors in the form before submitting.');
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      navigate('/dashboard');
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setError(t('auth.login.incorrect_credentials'));
      } else if (err.code === 'auth/network-request-failed') {
        setError(t('auth.login.network_error'));
      } else {
        setError(err.message || 'Failed to sign in');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4 md:top-8 md:right-8">
        <LanguageSelector />
      </div>
      <div className="mb-8 text-center flex flex-col items-center justify-center gap-1">
        <img src="https://i.imgur.com/Adh2bcY.png" alt="CECDE Logo" className="w-28 h-28 md:w-32 md:h-32 object-contain filter drop-shadow-sm transition-transform hover:scale-105 duration-300" />
        <div className="text-xl md:text-3xl font-bold tracking-tight tracking-[-0.02em] select-none">
          <span className="text-primary text-[#6C3BAA]">CECDE</span>
        </div>
      </div>
      <div className="card w-full max-w-md p-8 md:p-10">
        <div className="flex flex-col mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('auth.login.title')}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t('auth.login.subtitle')}</p>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive border border-destructive/20 text-sm p-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-foreground">{t('auth.login.email')}</label>
            <input 
              type="email" 
              required
              className={`input-field ${emailError ? 'border-destructive focus:ring-destructive' : ''}`}
              value={email}
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
            <label className="block text-sm font-semibold text-foreground">{t('auth.login.password')}</label>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                required
                className="input-field pl-4 pr-10"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          
          <div className="flex justify-end items-center">
            <Link to="/forgot-password" className="text-sm text-primary hover:underline font-medium">{t('auth.login.forgot_password')}</Link>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:opacity-90 hover:shadow-md transition-all disabled:opacity-50 mt-2 text-sm"
          >
            {loading ? t('auth.login.signing_in') : t('auth.login.sign_in')}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-muted-foreground border-t border-border pt-6">
          {t('auth.login.no_account')} <Link to="/register" className="text-primary hover:underline font-bold">{t('auth.login.create_account')}</Link>
        </div>
      </div>
    </div>
  );
}
