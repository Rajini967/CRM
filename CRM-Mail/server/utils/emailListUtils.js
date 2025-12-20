const EMAIL_SPLIT_REGEX = /[,\n\r;]+/;
const EMAIL_VALIDATE_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const toArray = (input) => {
  if (!input) {
    return [];
  }
  if (Array.isArray(input)) {
    return input;
  }
  if (typeof input === 'string') {
    return input.split(EMAIL_SPLIT_REGEX);
  }
  return [];
};

const normalizeEmailList = (input) => {
  const seen = new Set();
  const result = [];

  toArray(input).forEach((raw) => {
    const email = (raw || '').trim();
    if (!email) {
      return;
    }
    if (!EMAIL_VALIDATE_REGEX.test(email)) {
      return;
    }
    const key = email.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(email);
  });

  return result;
};

const mergeEmailLists = (...sources) => {
  const seen = new Set();
  const merged = [];

  sources.forEach((source) => {
    const normalized = normalizeEmailList(source);
    normalized.forEach((email) => {
      const key = email.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      merged.push(email);
    });
  });

  return merged;
};

module.exports = {
  normalizeEmailList,
  mergeEmailLists
};

