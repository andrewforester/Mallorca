export const FALLBACK_LINES: readonly string[] = [
  "Your move, I am just enjoying my tea.",
  "Hmm, let's see where this goes.",
  "I am not saying a word.",
  "Interesting. Very interesting.",
  "Go on then, surprise me.",
];

const B = "(?<![\\p{L}\\p{N}])";
const E = "(?![\\p{L}\\p{N}])";
const WINDOW = 4;

const word = (body: string): RegExp => new RegExp(`${B}(?:${body})${E}`, "u");

const AMBIGUOUS_TOKENS = new Set(["As", "Ah", "Ad"]);
const CARD_TOKEN = new RegExp(`${B}(?:10|[2-9TJQKA]|[tjqk])[cdhs]${E}`, "gu");
const SUIT_SYMBOL = /(?:10|[2-9TJQKA])\s?[♠♥♦♣♤♡♢♧]|[♠♥♦♣♤♡♢♧]\s?(?:10|[2-9TJQKA])/iu;

const EN_RANK = "ace|king|queen|jack|ten|nine|eight|seven|six|five|four|three|two|deuce";
const RU_RANK = [
  "туз\\p{L}*",
  "корол\\p{L}*",
  "дам[аыуео]\\p{L}*",
  "(?:валет|вальт)\\p{L}*",
  "(?:десят|девят|восьм[её]р|сем[её]р|шест[её]р|пят[её]р|четв[её]р|трой|двой)к\\p{L}*",
].join("|");
const RU_SUIT = "пик\\p{L}*|черв\\p{L}*|бубн\\p{L}*|бубен|треф\\p{L}*|крест\\p{L}*";

const RANK_OF_SUIT = word(
  `(?:${EN_RANK})s?\\s+of\\s+(?:spade|heart|diamond|club)s?|(?:${RU_RANK})\\s+(?:${RU_SUIT})`,
);
const POCKET = word(
  `pocket\\s+(?:${EN_RANK}|pair)\\p{L}*|карманн\\p{L}*\\s+(?:${RU_RANK}|пар\\p{L}*)`,
);

const EN_HOLDING = [
  "aces?|kings?|queens?|jacks?|deuces?",
  "tens|nines|eights|sevens|sixes|fives|fours|threes|twos",
  "pairs?|set|trips|straight|flush|boat|quads|royal",
  "full\\s+house|(?:three|four)\\s+of\\s+a\\s+kind",
  "an?\\s+(?:ten|nine|eight|seven|six|five|four|three|two)",
].join("|");
const RU_HOLDING = [
  RU_RANK,
  "пара|пары|пару|парой|паре|парочк\\p{L}*",
  "сет|сета|сету|сетом|трипс\\p{L}*|стрит\\p{L}*|фл[еэа]ш\\p{L}*",
  "фулл?(?:[\\s-]?хаус\\p{L}*)?|каре|роял\\p{L}*",
].join("|");
const HOLDING = word(`${EN_HOLDING}|${RU_HOLDING}`);

const POSSESSION = new RegExp(
  `${B}(?:i\\s+have|i've\\s+got|i've|ive|i\\s+got|i\\s+hold|i'm\\s+holding|i\\s+am\\s+holding|` +
    `i'm\\s+sitting\\s+on|my\\s+hand\\s+is|my\\s+cards\\s+are|у\\s+меня|я\\s+держу|держу|` +
    `мне\\s+пришл\\p{L}*|я\\s+собрал\\p{L}*)((?:\\s+[\\p{L}\\p{N}'-]+){1,${WINDOW}})`,
  "gu",
);

const RANK_WORDS: Record<string, string> = {
  A: "aces?|туз\\p{L}*",
  K: "kings?|корол\\p{L}*",
  Q: "queens?|дам[аыуео]\\p{L}*",
  J: "jacks?|(?:валет|вальт)\\p{L}*",
  T: "tens?|десятк\\p{L}*",
  "9": "nines?|девятк\\p{L}*",
  "8": "eights?|восьм[её]рк\\p{L}*",
  "7": "sevens?|сем[её]рк\\p{L}*",
  "6": "six(?:es)?|шест[её]рк\\p{L}*",
  "5": "fives?|пят[её]рк\\p{L}*",
  "4": "fours?|четв[её]рк\\p{L}*",
  "3": "threes?|treys?|тройк\\p{L}*",
  "2": "twos?|deuces?|двойк\\p{L}*",
};

const normalize = (text: string): string =>
  text.normalize("NFC").replace(/[‘’ʼ`]/g, "'").replace(/[︎️]/g, "");

function namesCard(text: string, hole: readonly string[]): boolean {
  for (const [token] of text.matchAll(CARD_TOKEN)) {
    if (!AMBIGUOUS_TOKENS.has(token) || hole.includes(token)) return true;
  }
  return SUIT_SYMBOL.test(text);
}

function claimsHolding(lower: string): boolean {
  for (const match of lower.matchAll(POSSESSION)) {
    const tail = match[1].trim();
    if (tail.startsWith("to ") || tail === "to") continue;
    if (HOLDING.test(tail)) return true;
  }
  return false;
}

function namesHolding(text: string, lower: string, hole: readonly string[]): boolean {
  if (hole.length !== 2) return false;
  const [a, b] = [hole[0][0], hole[1][0]];
  const shorthand = new RegExp(
    `${B}(?:${a}${b}|${b}${a}|${a}\\s?[-/]\\s?${b}|${b}\\s?[-/]\\s?${a})[so]?${E}`,
    "u",
  );
  if (shorthand.test(text)) return true;
  const [x, y] = [RANK_WORDS[a], RANK_WORDS[b]];
  if (x === undefined || y === undefined) return false;
  const link = "(?:\\s+(?:and|и))?[\\s-]+";
  return word(`(?:${x})${link}(?:${y})|(?:${y})${link}(?:${x})`).test(lower);
}

export function leaksCards(text: string, hole: readonly string[]): boolean {
  const clean = normalize(text);
  const lower = clean.toLowerCase();
  if (namesCard(clean, hole)) return true;
  if (RANK_OF_SUIT.test(lower) || POCKET.test(lower)) return true;
  return claimsHolding(lower) || namesHolding(clean, lower, hole);
}
