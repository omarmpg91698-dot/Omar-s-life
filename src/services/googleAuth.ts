import {getApp, getApps, initializeApp} from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const SCOPES = ['https://www.googleapis.com/auth/drive.file'] as const;

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({
  prompt: 'select_account',
});

// Flag to indicate if a sign-in popup flow is currently in progress.
let isSigningIn = false;
// Cache the Google OAuth access token strictly in memory (never in localStorage/sessionStorage).
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: (signedInUserWithoutToken?: User | null) => void,
) => {
  // Complete a redirect sign-in (used inside the Android WebView, where popups
  // are not supported). Grab the OAuth access token before auth state fires.
  isSigningIn = true;
  getRedirectResult(auth)
    .then((result) => {
      if (result) {
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
          cachedAccessToken = credential.accessToken;
          onAuthSuccess?.(result.user, credential.accessToken);
        }
      }
    })
    .catch(() => {
      // No pending redirect or it failed; auth state below decides the UI.
    })
    .finally(() => {
      isSigningIn = false;
    });
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthFailure?.(user);
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure?.(null);
    }
  });
};

const isAndroidWebView =
  typeof window !== 'undefined' && 'OmarNative' in window;

export const googleSignIn = async (): Promise<{user: User; accessToken: string}> => {
  // Popups don't work inside the Android WebView (no multi-window support),
  // so there we navigate the whole view through the redirect flow instead.
  // The result is picked up by getRedirectResult in initAuth after reload.
  if (isAndroidWebView) {
    isSigningIn = true;
    await signInWithRedirect(auth, provider);
    // The page navigates away; this only runs if starting the redirect failed.
    isSigningIn = false;
    throw new Error('مقدرناش نفتح صفحة تسجيل الدخول. جرب تاني.');
  }
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('مقدرناش ناخد تصريح الوصول لـ Google Drive من حساب Google.');
    }
    cachedAccessToken = credential.accessToken;
    return {user: result.user, accessToken: cachedAccessToken};
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const clearAccessToken = () => {
  cachedAccessToken = null;
};

export const logout = async (): Promise<void> => {
  cachedAccessToken = null;
  await auth.signOut();
};
