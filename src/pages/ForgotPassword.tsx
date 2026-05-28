import React, { useState } from 'react';
import { Link } from 'react-router';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../lib/firebase';
import toast from 'react-hot-toast';
import { Activity, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Please enter your email address');
      return;
    }
    
    // Rate limiting / abuse prevention
    if (cooldown > 0) {
      toast.error(`Please wait ${cooldown} seconds before trying again`);
      return;
    }

    setLoading(true);
    try {
      // Setup ActionCodeSettings to return to the app's login page
      // In production, you would configure the Firebase email template 
      // to point to the dedicated reset page if you want custom UI.
      // E.g., `https://your-domain.com/reset-password`
      await sendPasswordResetEmail(auth, email, {
        url: `${window.location.origin}/login`
      });
      
      // We always fall through here to prevent enumeration
      setIsSent(true);
      
      // Start a 60-second cooldown
      setCooldown(60);
      const timer = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      toast.success('If an account exists, a recovery link has been sent.', {
        duration: 5000,
      });

    } catch (error: any) {
      console.error('Password reset error:', error);
      
      // Account enumeration protection: We DO NOT show "user not found"
      if (error.code === 'auth/user-not-found') {
        // Mock success to prevent discovering registered emails
        setIsSent(true);
        setCooldown(60);
        const timer = setInterval(() => {
          setCooldown((prev) => {
            if (prev <= 1) {
              clearInterval(timer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        return;
      }
      
      if (error.code === 'auth/invalid-email') {
        toast.error('Please enter a valid email format');
      } else if (error.code === 'auth/too-many-requests') {
        toast.error('Too many attempts. Please try again later.');
      } else {
        toast.error('Could not process this request. Please try again safely.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900 dark:text-white">
              EINORT
            </span>
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
          Account Recovery
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          Enter your email to receive a secure password reset link.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-gray-800 py-8 px-4 shadow-xl sm:rounded-xl sm:px-10 border border-gray-100 dark:border-gray-700">
          {isSent ? (
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
                Check your inbox
              </h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                If an account exists for <span className="font-medium text-gray-900 dark:text-white">{email}</span>, a secure recovery link has been sent.
              </p>
              
              <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
                <Link
                  to="/login"
                  className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 dark:text-primary-300 dark:bg-primary-900/30 dark:hover:bg-primary-900/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
                >
                  Return to login
                </Link>
                
                <p className="mt-4 text-xs text-center text-gray-500 dark:text-gray-400">
                  Didn't receive the email? Check your spam folder or{' '}
                  <button 
                    onClick={() => setIsSent(false)} 
                    className="text-primary-600 hover:text-primary-500 font-medium disabled:opacity-50"
                    disabled={cooldown > 0}
                  >
                    try again {cooldown > 0 && `in ${cooldown}s`}
                  </button>
                </p>
              </div>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Email address
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="appearance-none block w-full pl-10 px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-700 dark:text-white transition-colors"
                    placeholder="you@company.com"
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading || cooldown > 0}
                  className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:focus:ring-offset-gray-900 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    'Send Recovery Link'
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <Link
                    to="/login"
                    className="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400 inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to sign in
                  </Link>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
