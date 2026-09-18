const fs = require('fs');
const path = require('path');

let loaded = false;

const unquote = (value) => {
  const text = String(value ?? '').trim();
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
    return text.slice(1, -1);
  }
  return text;
};

const loadLocalEnvironment = () => {
  if (loaded) return;
  loaded = true;
  const candidates = [
    path.resolve(process.cwd(), 'atlas-credentials.env'),
    path.resolve(process.cwd(), '.env.local'),
  ];
  candidates.forEach((file) => {
    if (!fs.existsSync(file)) return;
    fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const separator = trimmed.indexOf('=');
      if (separator <= 0) return;
      const key = trimmed.slice(0, separator).trim();
      if (!/^[A-Z_][A-Z0-9_]*$/i.test(key) || process.env[key] !== undefined) return;
      process.env[key] = unquote(trimmed.slice(separator + 1));
    });
  });
};

module.exports = { loadLocalEnvironment };
