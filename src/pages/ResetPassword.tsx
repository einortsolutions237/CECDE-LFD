import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth } from '../lib/firebase';
import toast from 'react-hot-toast';
import { Activity, Lock, CheckCircle2, Eye, EyeOff, AlertCircle } from 'lucide-react';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [isValidCode, setIsValidCode] = useState(false);
  const [email, setEmail] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  // Parse the Firebase action code from URL
  const oobCode = searchParams.get('oobCode');

  useEffect(() => {
    // Verify the password reset code automatically
    const verifyCode = async () => {
      if (!oobCode) {
        setVerifying(false);
        setIsValidCode(false);
        return;
      }

      try {
        const emailResult = await verifyPasswordResetCode(auth, oobCode);
        setEmail(emailResult);
        setIsValidCode(true);
      } catch (error) {
        console.error('Invalid or expired action code', error);
        setIsValidCode(false);
      } finally {
        setVerifying(false);
      }
    };

    verifyCode();
  }, [oobCode]);

  // Password Security Enforcement Validator
  const validatePassword = (password: string) => {
    const minLength = 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNum = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    if (password.length < minLength) return 'Password must be at least 8 characters';
    if (!hasUpper) return 'Password must include an uppercase letter';
    if (!hasLower) return 'Password must include a lowercase letter';
    if (!hasNum) return 'Password must include a number';
    if (!hasSpecial) return 'Password must include a special character';
    
    return null; // Valid
  };

  const calculateStrength = (password: string) => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    return strength; // 0 to 5
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!oobCode) return;

    const validationError = validatePassword(newPassword);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setIsSuccess(true);
      toast.success('Password successfully reset! You can now log in.');
    } catch (error: any) {
      console.error('Password reset confirmation error:', error);
      toast.error('Could not reset password. The link may have expired or been used.');
    } finally {
      setLoading(false);
    }
  };

  const strength = calculateStrength(newPassword);
  const getStrengthColor = () => {
    if (strength <= 2) return 'bg-red-500';
    if (strength <= 4) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  if (verifying) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex justify-center items-center">
        <div className="w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isValidCode && !isSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white dark:bg-gray-800 py-8 px-4 shadow-xl sm:rounded-xl sm:px-10 border border-gray-100 dark:border-gray-700 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
              Invalid or Expired Link
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              This password reset link is invalid or has expired. Please request a new one safely.
            </p>
            <div className="mt-6">
              <Link
                to="/forgot-password"
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
              >
                Request New Link
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
          Secure Password Reset
        </h2>
        {!isSuccess && (
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Resetting password for <span className="font-semibold text-gray-900 dark:text-white">{email}</span>
          </p>
        )}
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-gray-800 py-8 px-4 shadow-xl sm:rounded-xl sm:px-10 border border-gray-100 dark:border-gray-700">
          {isSuccess ? (
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
                Password Reset Successful
              </h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Your account password has been securely updated.
              </p>
              
              <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
                <Link
                  to="/login"
                  className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
                >
                  Continue to Sign In
                </Link>
              </div>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="newPassword"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  New Password
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="newPassword"
                    name="newPassword"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="appearance-none block w-full pl-10 pr-10 px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-700 dark:text-white transition-colors"
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-500"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
                
                {/* Password Strength Indicator */}
                {newPassword && (
                  <div className="mt-2">
                    <div className="flex gap-1 h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      {[1, 2, 3, 4, 5].map((lvl) => (
                        <div
                          key={lvl}
                          className={`flex-1 transition-colors duration-300 ${
                            strength >= lvl ? getStrengthColor() : 'bg-transparent'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 dark:text-gray-400 flex flex-wrap gap-x-3 gap-y-1">
                      <span className={newPassword.length >= 8 ? 'text-green-600 dark:text-green-400' : ''}>• 8+ chars</span>
                      <span className={/[A-Z]/.test(newPassword) ? 'text-green-600 dark:text-green-400' : ''}>• Uppercase</span>
                      <span className={/[a-z]/.test(newPassword) ? 'text-green-600 dark:text-green-400' : ''}>• Lowercase</span>
                      <span className={/[0-9]/.test(newPassword) ? 'text-green-600 dark:text-green-400' : ''}>• Number</span>
                      <span className={/[^A-Za-z0-9]/.test(newPassword) ? 'text-green-600 dark:text-green-400' : ''}>• Special</span>
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Confirm Password
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="appearance-none block w-full pl-10 px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-700 dark:text-white transition-colors"
                    placeholder="Confirm new password"
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:focus:ring-offset-gray-900 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    'Reset Secure Password'
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
