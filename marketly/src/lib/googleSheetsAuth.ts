import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const GOOGLE_SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
] as const;

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of GOOGLE_SHEETS_SCOPES) {
  provider.addScope(scope);
}

let isSigningIn = false;
// Store OAuth access token strictly in memory (never localStorage/sessionStorage)
let cachedAccessToken: string | null = null;

export const initGoogleSheetsAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, (user) => {
    if (user && cachedAccessToken) {
      onAuthSuccess?.(user, cachedAccessToken);
    } else if (!isSigningIn) {
      if (!user) {
        cachedAccessToken = null;
      }
      onAuthFailure?.();
    }
  });
};

export const signInWithGoogleSheets = async (): Promise<{
  user: User;
  accessToken: string;
}> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google sign-in did not return a Google Sheets access token.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getGoogleSheetsAccessToken = (): string | null => cachedAccessToken;

export const signOutGoogleSheets = async (): Promise<void> => {
  await auth.signOut();
  cachedAccessToken = null;
};

export function extractSpreadsheetId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  if (!trimmed) return null;
  const match = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(trimmed);
  if (match?.[1]) return match[1];
  if (/^[a-zA-Z0-9-_]{16,}$/.test(trimmed)) return trimmed;
  return null;
}

export interface GoogleSheetTabInfo {
  title: string;
}

export async function fetchGoogleSpreadsheetMetadata(
  spreadsheetId: string,
  accessToken: string
): Promise<{ title: string; sheets: GoogleSheetTabInfo[] }> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties.title`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = (errBody as { error?: { message?: string } })?.error?.message;
    throw new Error(msg || `Could not open Google Sheet (${res.status}). Check link and permissions.`);
  }
  const data = (await res.json()) as {
    properties?: { title?: string };
    sheets?: { properties?: { title?: string } }[];
  };
  return {
    title: data.properties?.title || 'Google Spreadsheet',
    sheets: (data.sheets || [])
      .map((s) => ({ title: s.properties?.title || '' }))
      .filter((s) => Boolean(s.title)),
  };
}

export async function fetchGoogleSheetRows(
  spreadsheetId: string,
  sheetTitle: string,
  accessToken: string
): Promise<string[][]> {
  const range = `'${sheetTitle.replace(/'/g, "''")}'`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = (errBody as { error?: { message?: string } })?.error?.message;
    throw new Error(msg || `Could not read rows from sheet "${sheetTitle}".`);
  }
  const data = (await res.json()) as { values?: unknown[][] };
  return (data.values || []).map((row) => row.map((cell) => String(cell ?? '').trim()));
}
