import type { Act } from "../planTypes.ts";

export const EXAMPLES: Readonly<Record<Act, readonly string[]>> = {
  react: ["Oh.", "Hm.", "Well, well.", "Huh.", "There it is."],
  claim: [
    "I like this board.",
    "Not sure about this one.",
    "I've got something.",
    "Feels thin.",
    "This one's good.",
  ],
  press: ["Your move.", "Let's see you call.", "Over to you.", "Your decision.", "Go on then."],
  stall: ["Hm, give me a second.", "Let me think.", "Hold on.", "Wait.", "Hmm, okay."],
  deflect: ["We'll see.", "Who knows.", "Maybe.", "Could be.", "Guess."],
  concede: ["Well played.", "Fair enough.", "Yours.", "Nice hand.", "Got me."],
  complain: ["Of course it's the ace.", "Every time.", "Unbelievable.", "Not again.", "Typical."],
  enjoy: ["That was nice.", "I'll take it.", "Lovely.", "Sweet.", "Thank you."],
  tease: ["Bluffing again?", "Brave bet.", "Sure about that?", "Bold.", "Nice try."],
  answer: [
    "Maybe I am.",
    "You'll have to pay to see.",
    "Ask the cards.",
    "Not telling.",
    "Could be.",
  ],
};

export function examplesBlock(): string {
  const lines = Object.entries(EXAMPLES).map(([act, list]) => `${act}: ${list.join(" / ")}`);
  return ["Example lines, to show the length and tone, never to repeat:", ...lines].join("\n");
}
