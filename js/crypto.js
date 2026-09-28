/*
  Verschlüsselung mit WebCrypto: PBKDF2-SHA256 leitet aus dem Passwort
  einen AES-GCM-256-Schlüssel ab.
  Das Passwort wird nie gespeichert. In der Session liegt nur der
  abgeleitete, nicht exportierbare Schlüssel samt Salt im Speicher.
*/

export const ITERATIONS = 300000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const FORMAT_VERSION = 1;

// Aktive Session: { key: CryptoKey, salt: base64 }
let session = null;

/* Base64-Helfer, blockweise, damit große Daten den Stack nicht sprengen */

export function toBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, view.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

/* Schlüsselableitung */

export async function deriveKey(password, salt, iterations = ITERATIONS) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Passwort fehlt.');
  }
  const saltBytes = typeof salt === 'string' ? fromBase64(salt) : salt;
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/* Session */

// Leitet den Schlüssel ab und hält ihn für die Session. Ohne Salt wird ein neues erzeugt.
export async function unlock(password, salt = toBase64(randomBytes(SALT_BYTES))) {
  const key = await deriveKey(password, salt);
  session = { key, salt };
  return session;
}

export function useSession(key, salt) {
  session = { key, salt };
}

export function lock() {
  session = null;
}

export function isUnlocked() {
  return session !== null;
}

export function sessionSalt() {
  return session?.salt ?? null;
}

/* Ver- und Entschlüsseln */

// Verschlüsselt ein Objekt mit dem Session-Schlüssel (oder einem übergebenen { key, salt })
export async function encrypt(obj, keyInfo = session) {
  if (!keyInfo) throw new Error('Kein Schlüssel aktiv. Bitte Passwort eingeben.');
  const iv = randomBytes(IV_BYTES);
  const plaintext = new TextEncoder().encode(JSON.stringify(obj));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keyInfo.key, plaintext);
  return {
    v: FORMAT_VERSION,
    iterations: ITERATIONS,
    salt: keyInfo.salt,
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  };
}

/*
  Entschlüsselt { salt, iv, ciphertext }.
  secret: Passwort (String) oder CryptoKey. Ohne Angabe wird der
  Session-Schlüssel genutzt, sofern das Salt passt.
*/
export async function decrypt(payload, secret) {
  if (!payload?.salt || !payload?.iv || !payload?.ciphertext) {
    throw new Error('Verschlüsselte Daten sind unvollständig.');
  }
  let key;
  if (typeof secret === 'string') {
    key = await deriveKey(secret, payload.salt, payload.iterations ?? ITERATIONS);
  } else if (secret) {
    key = secret;
  } else if (session && session.salt === payload.salt) {
    key = session.key;
  } else {
    throw new Error('Passwort nötig.');
  }
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(payload.iv) }, key, fromBase64(payload.ciphertext));
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error('Passwort falsch oder Daten beschädigt.');
  }
}
