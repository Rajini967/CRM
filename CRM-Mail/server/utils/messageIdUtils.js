// Normalize a Message-ID by trimming whitespace/brackets and wrapping in angle brackets.
// If input is falsy, returns null.
function normalizeMessageId(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/^<+|>+$/g, '');
  if (!trimmed) return null;
  return `<${trimmed}>`;
}

// Normalize subject helper
function normalizeSubject(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

module.exports = { normalizeMessageId, normalizeSubject };

