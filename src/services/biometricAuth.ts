import type { ParticipantId } from '../shared/types.ts';

export const BIO_TOKEN_KEY = (pid: ParticipantId) => `estrelas_bio_${pid}`;
export const BIO_CRED_KEY = (pid: ParticipantId) => `estrelas_bio_cred_${pid}`;

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function randomChallenge(length = 32): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(length);
  const bytes = new Uint8Array(buf);
  crypto.getRandomValues(bytes);
  return bytes;
}

function isEmbeddedIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

function isIframePolicyBlockError(err: unknown): boolean {
  if (!isEmbeddedIframe()) return false;
  if (!(err instanceof Error)) return false;
  const msg = `${err.name} ${err.message}`.toLowerCase();
  return (
    err.name === 'SecurityError' ||
    msg.includes('permissions policy') ||
    msg.includes('not enabled') ||
    msg.includes('cross-origin') ||
    msg.includes('publickey-credentials')
  );
}

export function hasLocalBiometricToken(pid: ParticipantId): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(localStorage.getItem(BIO_TOKEN_KEY(pid)));
  } catch {
    return false;
  }
}

export function getLocalBiometricToken(pid: ParticipantId): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(BIO_TOKEN_KEY(pid));
  } catch {
    return null;
  }
}

export function saveLocalBiometricToken(pid: ParticipantId, token: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BIO_TOKEN_KEY(pid), token);
  } catch {
    // ignore storage errors
  }
}

export function clearLocalBiometricData(pid: ParticipantId): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(BIO_TOKEN_KEY(pid));
    localStorage.removeItem(BIO_CRED_KEY(pid));
  } catch {
    // ignore storage errors
  }
}

export async function isPlatformBiometricSupported(): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    !window.isSecureContext ||
    typeof window.PublicKeyCredential === 'undefined' ||
    typeof navigator === 'undefined' ||
    !navigator.credentials
  ) {
    return false;
  }
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export interface BiometricPromptResult {
  ok: boolean;
  usedNativeSensor: boolean;
  credentialId?: string;
  error?: string;
}

/**
 * Registers a native platform biometric passkey (Android 15 BiometricPrompt / Face ID / Touch ID)
 * when available, gracefully handling sandboxed iframe contexts where Permissions-Policy blocks WebAuthn.
 */
export async function enrollDeviceBiometric(
  pid: ParticipantId,
  displayName: string
): Promise<BiometricPromptResult> {
  const supported = await isPlatformBiometricSupported();
  if (!supported) {
    return { ok: true, usedNativeSensor: false };
  }

  try {
    const userIdBytes = new TextEncoder().encode(`estrelas:${pid}`);
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge(),
        rp: { name: 'Estrelas da Casa' },
        user: {
          id: userIdBytes,
          name: `${displayName} (${pid})`,
          displayName,
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },
          { alg: -257, type: 'public-key' },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (!cred) {
      return {
        ok: false,
        usedNativeSensor: true,
        error: 'Confirmação biométrica não concluída no aparelho.',
      };
    }

    const credId = bytesToBase64Url(new Uint8Array(cred.rawId));
    try {
      localStorage.setItem(BIO_CRED_KEY(pid), credId);
    } catch {
      // ignore storage quota errors
    }
    return { ok: true, usedNativeSensor: true, credentialId: credId };
  } catch (err) {
    if (isIframePolicyBlockError(err)) {
      return { ok: true, usedNativeSensor: false };
    }
    return {
      ok: false,
      usedNativeSensor: true,
      error: 'Biometria cancelada ou não reconhecida pelo aparelho.',
    };
  }
}

/**
 * Prompts native device biometric verification (digital / face unlock) before exchanging the stored
 * biometric token with the server. Rejects if the user cancels the native prompt.
 */
export async function verifyDeviceBiometric(
  pid: ParticipantId,
  displayName: string
): Promise<BiometricPromptResult> {
  const supported = await isPlatformBiometricSupported();
  if (!supported) {
    return { ok: true, usedNativeSensor: false };
  }

  let savedCredId: string | null = null;
  try {
    savedCredId = localStorage.getItem(BIO_CRED_KEY(pid));
  } catch {
    savedCredId = null;
  }

  // Upgrade older saved biometric tokens that don't yet have a WebAuthn platform credential
  if (!savedCredId) {
    return enrollDeviceBiometric(pid, displayName);
  }

  try {
    const rawIdBytes = base64UrlToBytes(savedCredId);
    const idBuffer = new ArrayBuffer(rawIdBytes.byteLength);
    new Uint8Array(idBuffer).set(rawIdBytes);

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        allowCredentials: [
          {
            id: idBuffer,
            type: 'public-key',
            transports: ['internal'],
          },
        ],
        userVerification: 'required',
        timeout: 60000,
      },
    });

    if (!assertion) {
      return {
        ok: false,
        usedNativeSensor: true,
        error: 'Biometria não confirmada neste aparelho.',
      };
    }

    return { ok: true, usedNativeSensor: true, credentialId: savedCredId };
  } catch (err) {
    if (isIframePolicyBlockError(err)) {
      return { ok: true, usedNativeSensor: false };
    }
    // If the browser says no credential found on this device, allow re-enrolling once via sensor
    if (err instanceof Error && err.name === 'InvalidStateError') {
      return enrollDeviceBiometric(pid, displayName);
    }
    return {
      ok: false,
      usedNativeSensor: true,
      error: 'Leitura biométrica cancelada ou não reconhecida.',
    };
  }
}
