import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserPopupRedirectResolver,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
] as const;

const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

const provider = new GoogleAuthProvider();
for (const scope of GOOGLE_DRIVE_SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({ prompt: 'select_account' });

// Keep the OAuth access token strictly in memory (never in localStorage or sessionStorage).
let isSigningIn = false;
let cachedAccessToken: string | null = null;
let inFlightSignIn: Promise<{ user: User; accessToken: string }> | null = null;

export type GoogleDriveUser = User;

const mapFirebaseDriveAuthError = (error: unknown): Error => {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const message = error instanceof Error ? error.message : String(error || '');

  if (code === 'auth/popup-closed-by-user' || message.includes('auth/popup-closed-by-user')) {
    return new Error(
      'تم إغلاق نافذة تسجيل الدخول بحساب Google قبل إتمام الربط. يرجى المحاولة مرة أخرى وعدم إغلاق النافذة المنبثقة، والتأكد من السماح بالنوافذ المنبثقة في المتصفح.',
    );
  }
  if (code === 'auth/cancelled-popup-request' || message.includes('auth/cancelled-popup-request')) {
    return new Error('تم إلغاء طلب تسجيل الدخول السابق، يرجى المحاولة مرة أخرى.');
  }
  if (code === 'auth/popup-blocked' || message.includes('auth/popup-blocked')) {
    return new Error(
      'قام المتصفح بحظر نافذة تسجيل الدخول المنبثقة. يرجى السماح بالنوافذ المنبثقة (Pop-ups) ثم المحاولة مرة أخرى.',
    );
  }
  if (code === 'auth/unauthorized-domain' || message.includes('auth/unauthorized-domain')) {
    return new Error(
      'النطاق الحالي غير مصرح له بتسجيل الدخول عبر Google في إعدادات الربط السحابي.',
    );
  }
  if (code === 'auth/operation-not-allowed' || message.includes('auth/operation-not-allowed')) {
    return new Error('تسجيل الدخول بحساب Google غير مفعّل حالياً في إعدادات المشروع.');
  }
  if (code === 'auth/network-request-failed' || message.includes('auth/network-request-failed')) {
    return new Error('تعذر الاتصال بخدمة Google، يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.');
  }
  return error instanceof Error ? error : new Error('تعذر تسجيل الدخول بحساب Google.');
};

export const initGoogleDriveAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void,
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthFailure?.();
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure?.();
    }
  });
};

export const signInWithGoogleDrive = async (): Promise<{
  user: User;
  accessToken: string;
}> => {
  if (inFlightSignIn) {
    return inFlightSignIn;
  }

  isSigningIn = true;
  inFlightSignIn = (async () => {
    try {
      const result = await signInWithPopup(auth, provider, browserPopupRedirectResolver);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error('تعذر الحصول على تصريح الوصول لخدمة Google Drive.');
      }
      cachedAccessToken = credential.accessToken;
      return { user: result.user, accessToken: cachedAccessToken };
    } catch (error) {
      throw mapFirebaseDriveAuthError(error);
    } finally {
      isSigningIn = false;
      inFlightSignIn = null;
    }
  })();

  return inFlightSignIn;
};

export const getGoogleDriveAccessToken = (): string | null => cachedAccessToken;

export const clearGoogleDriveToken = (): void => {
  cachedAccessToken = null;
};

export const signOutGoogleDrive = async (): Promise<void> => {
  cachedAccessToken = null;
  await auth.signOut();
};
