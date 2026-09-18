const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const PARAMETERS = { N: 131072, r: 8, p: 1, keyLength: 64, maxmem: 256 * 1024 * 1024 };

const validatePassword = (password) => {
  if (typeof password !== 'string' || password.length < 10) {
    throw new Error('Le mot de passe doit contenir au moins 10 caractères.');
  }
  if (password.length > 256) throw new Error('Le mot de passe est trop long.');
};

const hashPassword = async (password) => {
  validatePassword(password);
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, PARAMETERS.keyLength, PARAMETERS);
  return `scrypt$${PARAMETERS.N}$${PARAMETERS.r}$${PARAMETERS.p}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
};

const verifyPassword = async (password, encoded) => {
  try {
    const [algorithm, n, r, p, saltValue, hashValue] = String(encoded).split('$');
    if (algorithm !== 'scrypt' || !saltValue || !hashValue) return false;
    const expected = Buffer.from(hashValue, 'base64url');
    const derived = await scrypt(password, Buffer.from(saltValue, 'base64url'), expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: PARAMETERS.maxmem,
    });
    return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
  } catch (error) {
    return false;
  }
};

module.exports = { hashPassword, validatePassword, verifyPassword };
