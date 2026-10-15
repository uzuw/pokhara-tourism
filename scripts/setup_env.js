#!/usr/bin/env node
/**
 * Generates ./.env (and frontend/.env.local) with strong random secrets.
 *
 *   node scripts/setup_env.js            # create, never overwrite
 *   node scripts/setup_env.js --force    # regenerate secrets (invalidates sessions)
 *
 * Secrets are generated here and written straight to disk — they never appear
 * in shell history, logs, or anywhere else.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const ENV = path.join(ROOT, '.env');
const ENV_EXAMPLE = path.join(ROOT, '.env.example');
const FE_ENV = path.join(ROOT, 'frontend', '.env.local');
const force = process.argv.includes('--force');

const secret = (bytes = 48) => crypto.randomBytes(bytes).toString('hex');

function writeIfAbsent(file, build) {
  if (fs.existsSync(file) && !force) {
    console.log(`• ${path.relative(ROOT, file)} already exists — left untouched (use --force to regenerate)`);
    return false;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = build();
  fs.writeFileSync(file, body, { mode: 0o600 });
  console.log(`✓ wrote ${path.relative(ROOT, file)} (mode 0600)`);
  return true;
}

// Start from .env.example so the two never drift apart, then fill in values.
const template = fs.existsSync(ENV_EXAMPLE) ? fs.readFileSync(ENV_EXAMPLE, 'utf8') : '';

writeIfAbsent(ENV, () => {
  const jwt = secret(48);
  let out = template;
  if (/^JWT_SECRET=.*$/m.test(out)) {
    out = out.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${jwt}`);
  } else {
    out += `\nJWT_SECRET=${jwt}\n`;
  }
  out = out.replace(/^NODE_ENV=.*$/m, 'NODE_ENV=development');
  return out;
});

writeIfAbsent(FE_ENV, () => `# The Express backend. In dev, Next proxies /api and /assets through
# next.config.mjs, so the browser uses same-origin paths and this is optional.
NEXT_PUBLIC_API_URL=http://localhost:4000
SITE_URL=http://localhost:3000
`);

console.log('\nNext:  npm run dev:all   (API :4000 + web :3000)');
