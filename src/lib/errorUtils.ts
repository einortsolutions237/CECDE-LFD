import { toast } from 'react-hot-toast';

export function handleProductionError(error: any, contextStr: string = "Operation failed", fallbackMsg: string = "An unexpected error occurred. Please try again later.") {
  // 1. Structured logging (safe for production monitoring)
  console.error(`[${contextStr}] Error:`, error?.code || 'UNKNOWN_CODE', error?.message || error);

  // 2. Map Firebase / System errors to UX-friendly messages
  let userMessage = fallbackMsg;
  const errMsg = (error?.message || '').toLowerCase();
  const errCode = (error?.code || '').toLowerCase();

  if (errMsg.includes('permission-denied') || errMsg.includes('missing or insufficient permissions') || errCode.includes('permission-denied')) {
    userMessage = "You do not have the required permissions to perform this action.";
  } else if (errMsg.includes('network') || errCode.includes('network')) {
    userMessage = "Network error. Please check your internet connection.";
  } else if (errMsg.includes('not-found') || errCode.includes('not-found')) {
    userMessage = "The requested record could not be found. It may have been deleted.";
  } else if (errMsg.includes('already-exists') || errCode.includes('already-exists')) {
    userMessage = "This record already exists.";
  } else if (errCode === 'auth/email-already-in-use') {
    userMessage = "This email is already registered.";
  } else if (errCode === 'auth/wrong-password' || errCode === 'auth/user-not-found' || errCode === 'auth/invalid-credential') {
    userMessage = "Invalid credentials. Please check your email and password.";
  } else if (errCode === 'auth/weak-password') {
    userMessage = "Password is too weak. Please use a stronger password.";
  } else if (errCode === 'auth/requires-recent-login') {
    userMessage = "This action requires recent authentication. Please log out and log back in.";
  }

  // 3. User Notification
  toast.error(userMessage, {
    position: 'top-right',
    duration: 5000,
  });

  return userMessage;
}
