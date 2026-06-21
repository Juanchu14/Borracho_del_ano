const crypto = require('crypto');

// Evitamos caracteres ambiguos (0/O, 1/I/L) para que el código se pueda
// dictar o teclear a mano sin confusiones, típico en una quedada con ruido.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomSegment(length) {
  let out = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

// Formato: XXXX-XXXX (8 caracteres + separador), p.ej. "K7P2-9XQM"
function generateInviteCode() {
  return `${randomSegment(4)}-${randomSegment(4)}`;
}

module.exports = { generateInviteCode };
