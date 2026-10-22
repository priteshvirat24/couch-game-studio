// Kid-safety layer for everything a child types or says.
//
// 1. Personal details (emails, phone numbers, street addresses, links) are removed
//    before anything is stored, shown on the TV, or sent to a model.
// 2. Cartoon violence is softened into silly equivalents ("kill" -> "bonk").
// 3. Topics that don't belong in a kids' game are declined with a friendly nudge.
// The AI designer also has its own instructions, so this is defence in depth.

const PII = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, ''],                                   // emails
  [/(?:\+?\d[\s.-]?){7,}\d/g, ''],                                      // phone-like numbers
  [/\bhttps?:\/\/\S+|\bwww\.\S+/gi, ''],                                // links
  [/\b\d{1,5}\s+\w+(\s\w+)?\s+(street|st|road|rd|avenue|ave|lane|ln|drive|dr|nagar|marg)\b/gi, ''], // addresses
];

// Softened, not refused: games are allowed to have cartoon baddies.
const SOFTEN = [
  [/\bkill(s|ed|ing)?\b/gi, 'bonk$1'],
  [/\bmurder(s|ed|ing)?\b/gi, 'bonk$1'],
  [/\bdie(s|d)?\b|\bdying\b/gi, 'get dizzy'],
  [/\bdead\b/gi, 'dizzy'],
  [/\bblood(y)?\b/gi, 'ketchup'],
  [/\bguns?\b|\brifles?\b|\bpistols?\b/gi, 'water blaster'],
  [/\bknife|knives\b/gi, 'spoon'],
  [/\bstab(s|bed|bing)?\b/gi, 'tickle$1'],
];

// Declined topics. Kept deliberately broad and mild; the model is also instructed.
const BLOCK = [
  /\b(sex|sexy|porn\w*|nude|naked|nsfw|boobs?|strip(per|ping)?)\b/i,
  /\b(drugs?|cocaine|heroin|meth|weed|marijuana|vape|vaping|cigarettes?|smok(e|ing) (weed|pot)|beer|vodka|whisk(e)?y|alcohol|drunk)\b/i,
  /\b(suicide|self[-\s]?harm|kill (myself|yourself)|cut myself|hang myself)\b/i,
  /\b(nazi\w*|hitler|terroris\w*|isis|school shoot\w*|mass shoot\w*)\b/i,
  /\b(f+u+c+k\w*|sh[i1]t\w*|b[i1]tch\w*|c+u+n+t\w*|d[i1]ck\w*|puss(y|ies))\b/i,
];

export const SAFE_NUDGE = 'Hmm, let’s make a different kind of game! How about animals, space, snacks or monsters?';

/**
 * Clean a kid's text. Returns { ok, text, changed } or { ok: false, reason }.
 */
export function checkText(input, { max = 400 } = {}) {
  let text = String(input || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  const original = text;
  for (const [re, sub] of PII) text = text.replace(re, sub);
  if (BLOCK.some((re) => re.test(text))) return { ok: false, reason: SAFE_NUDGE };
  for (const [re, sub] of SOFTEN) text = text.replace(re, sub);
  text = text.replace(/\s+/g, ' ').trim();
  return { ok: true, text, changed: text !== original };
}

/** Names shown on the TV: letters, digits, spaces and a few symbols only. */
export function cleanName(input, fallback = 'Player') {
  const name = String(input || '').replace(/[^\p{L}\p{N} ,'.&-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  if (!name || BLOCK.some((re) => re.test(name))) return fallback;
  return name;
}
