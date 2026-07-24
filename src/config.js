const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  apiKey: '',
  model: 'llama-3.3-70b-versatile',
};

function loadEnv() {
  try {
    const text = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');

    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const i = trimmed.indexOf('=');
      if (i < 1) continue;

      const key = trimmed.slice(0, i).trim();
      let val = trimmed.slice(i + 1).trim();

      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }

      process.env[key] = val;
    }
  } catch {}
}

loadEnv();

function getConfig() {
  return {
    apiKey: String(process.env.GROQ_API_KEY || '').trim(),
    model: String(process.env.GROQ_MODEL || DEFAULTS.model),
  };
}

module.exports = { getConfig, DEFAULTS };
