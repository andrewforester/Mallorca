import { assertEquals } from "../_shared/testing.ts";
import { FALLBACK_LINES, leaksCards } from "./filter.ts";

const KING_QUEEN = ["Ks", "Qd"] as const;
const ACES = ["As", "Ah"] as const;
const SUITED = ["7c", "6c"] as const;

const LEAKS: [string, readonly string[]][] = [
  ["I have Ks", KING_QUEEN],
  ["K♠ here", KING_QUEEN],
  ["Q ♦ and something else", KING_QUEEN],
  ["king of spades", KING_QUEEN],
  ["The Queen of Diamonds is a lovely card.", KING_QUEEN],
  ["I've got a pair of kings", KING_QUEEN],
  ["I’ve got kings, you know", KING_QUEEN],
  ["I'm holding two pair", KING_QUEEN],
  ["I HAVE A FLUSH", SUITED],
  ["I have a full house", SUITED],
  ["i got trips", SUITED],
  ["I hold a ten", SUITED],
  ["My hand is a straight", SUITED],
  ["Pocket aces, darling.", ACES],
  ["The As is mine", ACES],
  ["I raised with AK", ["Ah", "Kd"]],
  ["ace king, what else", ["Ah", "Kd"]],
  ["Seven six suited, a classic.", SUITED],
  ["10s and nines", SUITED],
  ["Td on the turn helped", SUITED],
  ["у меня два короля", KING_QUEEN],
  ["У меня пара", KING_QUEEN],
  ["я держу тузов", ACES],
  ["у меня на руках флеш", SUITED],
  ["Я держу фулл-хаус", SUITED],
  ["у меня сет", SUITED],
  ["у меня тут каре", SUITED],
  ["король пик у меня", KING_QUEEN],
  ["дама бубен", KING_QUEEN],
  ["Well, I had two queens and still gave you the pot.", KING_QUEEN],
  ["I went and folded queens to a bluff.", KING_QUEEN],
  ["I folded a set, can you believe it.", SUITED],
  ["My aces deserved better.", ACES],
  ["and I was holding aces of all things", ACES],
  ["I held kings and still lost", KING_QUEEN],
  ["and that was a perfectly good pair of kings", KING_QUEEN],
  ["я сбросила дам, представляешь", KING_QUEEN],
  ["у меня были тузы", ACES],
];

const CLEAN: [string, readonly string[]][] = [
  ["this one feels good", KING_QUEEN],
  ["nice river", KING_QUEEN],
  ["I like this flop", KING_QUEEN],
  ["I have a good feeling about this", KING_QUEEN],
  ["I've got a feeling you are bluffing", KING_QUEEN],
  ["I have to be honest, I like my chances", KING_QUEEN],
  ["Ah, the kettle is singing.", KING_QUEEN],
  ["As if I would fold now.", KING_QUEEN],
  ["You played that like a king.", KING_QUEEN],
  ["I have two minutes before the tea is ready.", KING_QUEEN],
  ["Strong hands make quiet people.", KING_QUEEN],
  ["мне нравится этот флоп", KING_QUEEN],
  ["у меня хорошее предчувствие", KING_QUEEN],
  ["Я держу себя в руках.", KING_QUEEN],
  ["красивый ривер", KING_QUEEN],
  ["Ты сегодня в ударе.", KING_QUEEN],
  ["I had a lovely evening anyway.", KING_QUEEN],
  ["I was holding my breath on the river.", KING_QUEEN],
  ["I folded, fair enough.", KING_QUEEN],
  ["My tea is cold and my luck is colder.", KING_QUEEN],
  ["My hands are a bit shaky tonight.", KING_QUEEN],
  ["Я сбросила, и правильно.", KING_QUEEN],
];

for (const [text, hole] of LEAKS) {
  Deno.test(`leaks: ${text}`, () => assertEquals(leaksCards(text, hole), true));
}

for (const [text, hole] of CLEAN) {
  Deno.test(`clean: ${text}`, () => assertEquals(leaksCards(text, hole), false));
}

Deno.test("a two rank shorthand leaks only when it is her holding", () => {
  assertEquals(leaksCards("I raised with AK", ["9h", "9c"]), false);
  assertEquals(leaksCards("nines are pretty", ["9h", "9c"]), false);
});

Deno.test("five short neutral fallback lines that do not leak", () => {
  assertEquals(FALLBACK_LINES.length, 5);
  for (const line of FALLBACK_LINES) {
    assertEquals(leaksCards(line, KING_QUEEN), false);
    assertEquals(/[–—]|\s-\s/.test(line), false);
    assertEquals(/\b[A-Z]{2,}\b/.test(line), false);
    assertEquals(line.length <= 60, true);
  }
});
