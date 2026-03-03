import crypto from "node:crypto";

const SALT_LEN = 16;
const KEY_LEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LEN).toString("hex");
  const key = await scryptAsync(
    plain,
    salt,
    KEY_LEN,
    SCRYPT_OPTIONS.N,
    SCRYPT_OPTIONS.r,
    SCRYPT_OPTIONS.p
  );
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [salt, keyHex] = stored.split(":");
  if (!salt || !keyHex) return false;
  const key = await scryptAsync(
    plain,
    salt,
    KEY_LEN,
    SCRYPT_OPTIONS.N,
    SCRYPT_OPTIONS.r,
    SCRYPT_OPTIONS.p
  );
  return crypto.timingSafeEqual(Buffer.from(keyHex, "hex"), key);
}

function scryptAsync(
  password: string,
  salt: string,
  keylen: number,
  N: number,
  r: number,
  p: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, { N, r, p }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}
