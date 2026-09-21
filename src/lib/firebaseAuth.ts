import * as jose from 'jose';

const PROJECT_ID = (process.env.FIREBASE_PROJECT_ID || '').trim() || 'festiveevents-e84f8';

const JWKS = jose.createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

export type FirebaseUser = {
  uid: string;
  email: string;
};

export async function verifyFirebaseToken(authHeader: string | undefined): Promise<FirebaseUser> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw Object.assign(new Error('Sign in required'), { status: 401 });
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    throw Object.assign(new Error('Sign in required'), { status: 401 });
  }

  const { payload } = await jose.jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${PROJECT_ID}`,
    audience: PROJECT_ID,
    clockTolerance: 120,
  });

  const uid = String(payload.user_id || payload.sub || '');
  if (!uid) {
    throw Object.assign(new Error('Sign in required'), { status: 401 });
  }
  return { uid, email: String(payload.email || '').toLowerCase() };
}

export const SUPER_ADMIN_EMAILS = ['madhu.palli@cognine.com'];

export function isSuperAdminEmail(email?: string | null) {
  return !!email && SUPER_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}