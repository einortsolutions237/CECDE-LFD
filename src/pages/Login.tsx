import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { LogIn, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      navigate('/dashboard');
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setError('Password or Email Incorrect');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Network Error: Please check your connection or disable any adblockers/VPNs that might be blocking the login.');
      } else {
        setError(err.message || 'Failed to sign in');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center flex flex-col items-center justify-center gap-1">
        <img src="https://i.imgur.com/Adh2bcY.png" alt="CECDE Logo" className="w-28 h-28 md:w-32 md:h-32 object-contain filter drop-shadow-sm transition-transform hover:scale-105 duration-300" />
        <div className="text-xl md:text-3xl font-bold tracking-tight tracking-[-0.02em] select-none">
          <span className="text-primary text-[#6C3BAA]">CECDE</span>
        </div>
      </div>
      <div className="card w-full max-w-md p-8 md:p-10">
        <div className="flex flex-col mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Welcome Back</h1>
          <p className="text-muted-foreground text-sm mt-1">Sign in to your dashboard</p>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive border border-destructive/20 text-sm p-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-foreground">Email Address</label>
            <input 
              type="email" 
              required
              className="input-field"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-foreground">Password</label>
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
            <a href="#" className="text-sm text-primary hover:underline font-medium">Forgot password?</a>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:opacity-90 hover:shadow-md transition-all disabled:opacity-50 mt-2 text-sm"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-muted-foreground border-t border-border pt-6">
          Don't have an account? <Link to="/register" className="text-primary hover:underline font-bold">Create account</Link>
        </div>
      </div>
    </div>
  );
}
