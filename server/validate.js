// Input validation + normalization helpers.
//
// Every value that reaches a SQL bind parameter or a response body goes through
// one of these first: the DB driver throws on unexpected types (which used to
// surface as a 500 with a stack trace), and untyped input is how type-confusion
// bugs start.

const RULES = {
  USERNAME_MIN: 3,
  USERNAME_MAX: 32,
  PASSWORD_MIN: 8,
  // bcrypt only reads the first 72 BYTES of a password — anything longer is
  // silently ignored, so we reject it instead of pretending it is stronger.
  PASSWORD_MAX_BYTES: 72,
  EMAIL_MAX: 254,
  COMMENT_MIN: 2,
  COMMENT_MAX: 2000,
  BIO_MAX: 500,
  AVATAR_MAX: 400,
  IDENTIFIER_MAX: 254,
  QUERY_MAX: 100,
  CATEGORY_MAX: 40,
  SLUG_MAX: 120,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Control characters (incl. NUL and newlines) have no place in stored identifiers.
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const ANGLE_RE = /[<>]/;

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'p@ssword',
  '12345678', '123456789', '1234567890', '11111111', '00000000',
  'qwertyui', 'qwerty123', 'qwertyuiop', 'letmein1', 'iloveyou',
  'admin123', 'admin1234', 'administrator', 'welcome1', 'sunshine',
  'football', 'baseball', 'dragon12', 'monkey12', 'abc12345',
  'pokhara123', 'pokhara1234', 'nepal1234', 'everest123', 'tourism123',
]);

const isStr = (v) => typeof v === 'string';

// Returns an error message string, or null when the password is acceptable.
function passwordError(value) {
  if (!isStr(value) || value.length === 0) return 'password is required';
  if (value.trim().length === 0) return 'password must not be only whitespace';
  if (value.length < RULES.PASSWORD_MIN) {
    return `password must be at least ${RULES.PASSWORD_MIN} characters`;
  }
  if (Buffer.byteLength(value, 'utf8') > RULES.PASSWORD_MAX_BYTES) {
    return `password must be at most ${RULES.PASSWORD_MAX_BYTES} bytes`;
  }
  const lower = value.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return 'password is too common';
  if (/^\d+$/.test(value)) return 'password must not be only digits';
  if (/^(.)\1+$/.test(value)) return 'password must not repeat one character';
  return null;
}

function validateUsername(value) {
  if (!isStr(value)) return { error: 'username must be a string' };
  const v = value.trim();
  if (v.length < RULES.USERNAME_MIN) return { error: `username must be at least ${RULES.USERNAME_MIN} characters` };
  if (v.length > RULES.USERNAME_MAX) return { error: `username must be at most ${RULES.USERNAME_MAX} characters` };
  if (CONTROL_RE.test(v)) return { error: 'username contains invalid characters' };
  if (ANGLE_RE.test(v)) return { error: 'username contains invalid characters' };
  return { value: v };
}

function validateEmail(value) {
  if (!isStr(value)) return { error: 'email must be a string' };
  const v = value.trim().toLowerCase(); // case-insensitive uniqueness
  if (v.length > RULES.EMAIL_MAX) return { error: 'email is too long' };
  if (!EMAIL_RE.test(v)) return { error: 'invalid email address' };
  return { value: v };
}

// 1..5 integer, accepting numeric strings but nothing else.
function parseScore(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value >= 1 && value <= 5 ? value : null;
  if (isStr(value) && /^[1-5]$/.test(value.trim())) return Number(value.trim());
  return null;
}

// Positive integer row id (rejects 'abc', '-1', 1e9, '', objects).
function parseId(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (isStr(value) && /^\d{1,12}$/.test(value.trim())) {
    const n = Number(value.trim());
    return n > 0 ? n : null;
  }
  return null;
}

function cleanText(value, { min = 0, max, field = 'text' } = {}) {
  if (!isStr(value)) return { error: `${field} must be a string` };
  const v = value.trim();
  if (v.length < min) return { error: `${field} is too short` };
  if (v.length > max) return { error: `${field} is too long (${max} max)` };
  return { value: v };
}

function cappedString(value, max, fallback) {
  if (!isStr(value)) return fallback;
  const v = value.replace(CONTROL_RE, '').slice(0, max);
  return v;
}

module.exports = {
  RULES,
  passwordError,
  validateUsername,
  validateEmail,
  parseScore,
  parseId,
  cleanText,
  cappedString,
  isStr,
};
