import type { PersonalityKey } from '../emotion/index.ts';

export interface CharacterSheet {
  name: string;
  short: string;
  about: string;
  poker: string;
}

const sheet = (name: string, short: string, about: string, poker: string): CharacterSheet => ({
  name,
  short,
  about,
  poker,
});

export const CHARACTER_SHEETS: Readonly<Record<PersonalityKey, CharacterSheet>> = {
  mallorca: sheet(
    'Mallorca',
    'a warm, curious host',
    'Mallorca has the cards, the table and the kettle on. Warm, curious and steady, she opens up when the evening goes well.',
    'Light and honest but active: she plays plenty of hands and presses them, and almost never bluffs.',
  ),
  ingrid: sheet(
    'Ingrid',
    'a cool professional',
    'Ingrid plays for a living and treats it like a job. Organised, cool and unflappable, she keeps her thoughts to herself.',
    'A steady grinder: she is never pushed off a hand, bluffs a little and keeps her bets small.',
  ),
  mira: sheet(
    'Mira',
    'a gentle, kind friend',
    'Mira is the friend who remembers every birthday. Kind, easy going and never in a hurry, she plays for the company.',
    'A friendly recreational player: she likes to see flops, bets modestly and never bluffs.',
  ),
  nina: sheet(
    'Nina',
    'an anxious perfectionist',
    'Nina is a junior architect who redraws every plan twice. Exacting and anxious, she hates her own mistakes more than losing.',
    'A nit: very few hands, small bets, no bluffs, and she folds when the pressure rises.',
  ),
  lola: sheet(
    'Lola',
    'an impulsive, touchy extrovert',
    'Lola laughs the loudest and takes offence the fastest. Sociable and impulsive, she feels everything at once.',
    'Loose and aggressive but scared: she bets big and plays many hands, then gives up when someone hits back.',
  ),
  sol: sheet(
    'Sol',
    'a cheerful, bold adventurer',
    'Sol has jumped out of planes and into cold lakes. Cheerful, outgoing and up for anything, she makes friends at every table.',
    'Honest and loose aggressive: lots of hands, big bets, few bluffs.',
  ),
  rita: sheet(
    'Rita',
    'a brash, quarrelsome tough nut',
    'Rita argues with referees, waiters and the weather. Brash and stubborn, nothing anyone says gets under her skin.',
    'A maniac: she plays almost every hand, raises, bluffs big and does not let go.',
  ),
  vera: sheet(
    'Vera',
    'a sharp-tongued, nervous pedant',
    'Vera corrects your grammar and then worries she was rude. Clever and exacting, she is more nervous than she lets on.',
    'Aggressive fit or fold: tight, she presses the hands she plays and folds when pressed back.',
  ),
  greta: sheet(
    'Greta',
    'a reserved, cautious observer',
    'Greta speaks rarely and notices everything. Quiet, cautious and patient, she waits for her moment.',
    'A rock: very few hands, small bets and the odd careful bluff.',
  ),
  boldSchemer: sheet(
    'Carla',
    'a bold, smooth-talking schemer',
    'Carla runs three side businesses, none of them on paper. Charming, quick and never nervous, she enjoys getting her way more than the prize.',
    'A maniac: she plays almost every hand, raises and reraises, bluffs often and big, and will not let go once she is in.',
  ),
  nervousCareerist: sheet(
    'Diana',
    'an ambitious, restless careerist',
    'Diana has a plan for the next ten years and a spreadsheet for this one. Clever and competitive, she worries that someone is about to overtake her.',
    'Loose and aggressive, she bluffs readily with small careful bets, but gives up as soon as someone pushes back.',
  ),
  lifeOfTheParty: sheet(
    'Bea',
    'the life of every party',
    'Bea knows everyone at the table by the second hand. Warm, curious and carefree, she plays for the company and laughs off a loss before the chips are pushed.',
    'Loose and aggressive but honest: she bets her hands big, rarely bluffs and calls down to see what you had.',
  ),
  caringActivist: sheet(
    'Hanna',
    'a tired mum of three',
    "Hanna runs the school committee, the food bank rota and her family. Open, warm and responsible, she carries everyone else's worries along with her own.",
    'She plays many hands and bets them honestly with small bets, almost never bluffs and folds when the pressure rises.',
  ),
  toughBoss: sheet(
    'Margit',
    'a tough, no-nonsense boss',
    'Margit runs a haulage company and expects things done her way. Disciplined and direct, she has little patience for fools or feelings.',
    'Tight and aggressive: few hands pressed hard, a willing bluffer with measured bets, and very hard to push off a hand.',
  ),
  hotheadBraggart: sheet(
    'Tanja',
    'a hot-headed braggart',
    'Tanja tells the story of every win twice and every loss not at all. Loud, impatient and touchy, she starts fights she cannot finish.',
    'Tight and aggressive with plenty of bluffs and big bets, but she folds when someone fights back.',
  ),
  reliableCaptain: sheet(
    'Kirsten',
    'a reliable team captain',
    "Kirsten coaches the girls' hockey team and has never missed a practice. Steady, fair and organised, she is the one everyone calls in a crisis.",
    'Honest and tight aggressive: she picks her hands, bets them with small measured sizes, never bluffs and does not fold once she is in.',
  ),
  fussyChatterbox: sheet(
    'Dolores',
    'a chatty, good-natured retiree',
    'Dolores talks through every hand about her grandchildren, her knees and the neighbours. Kind and scattered, she gets flustered easily and means well in everything.',
    'She plays few hands but bets them eagerly and big, never bluffs, and folds easily when the betting gets serious.',
  ),
  coldSceptic: sheet(
    'Irene',
    'a cold, sceptical scientist',
    'Irene is a research chemist who trusts data, not people. Curious, precise and unflappable, she assumes everyone is bluffing until shown otherwise.',
    'Quiet and loose: she plays many hands without betting much, bluffs with small bets and almost never folds.',
  ),
  gloomyRebel: sheet(
    'Noor',
    'a gloomy creative rebel',
    'Noor paints at night and argues with everyone by day. Imaginative, disorganised and moody, she distrusts rules and the people who make them.',
    'Quiet and loose, a frequent bluffer with big bets who folds when someone hits back.',
  ),
  calmPhilosopher: sheet(
    'Sofia',
    'a calm, kindly philosopher',
    'Sofia teaches philosophy and grows tomatoes. Curious, patient and serene, she is more interested in why you raised than in the pot.',
    'A calling station: she plays many hands, rarely bets, never bluffs, bets small and calls to the end.',
  ),
  dreamyArtist: sheet(
    'Liv',
    'a dreamy, sensitive artist',
    'Liv writes poems on napkins and forgets her keys. Gentle and imaginative, she takes everything to heart.',
    'Loose, passive and honest: she plays lots of hands, bets big when she does bet and folds under pressure.',
  ),
  unshakableLoner: sheet(
    'Hilde',
    'a sullen, unshakable loner',
    'Hilde lives alone with three dogs and does not explain herself. Blunt, careless and silent, nothing seems to rattle her.',
    'Tight and passive, yet a bluffer with big bets who never folds once she is in.',
  ),
  suspiciousGrump: sheet(
    'Agnes',
    'a suspicious, pedantic grump',
    'Agnes checks her change twice and the rules three times. Rigid, private and prickly, she expects to be cheated.',
    'Tight and passive, she bluffs with small bets when she does and folds whenever she feels threatened.',
  ),
  easygoingHomebody: sheet(
    'Martha',
    'an easy-going, good-natured homebody',
    'Martha would rather be home with a pot of soup and a crossword. Unhurried, kind and content, very little upsets her.',
    'Tight, passive and honest: few hands, big bets when she has it, and she does not fold once she has decided to play.',
  ),
  timidStickler: sheet(
    'Edith',
    'a timid, honest stickler',
    'Edith is a librarian who returns her books before they are due. Careful, shy and kind, she hates taking risks.',
    'A nit: very few hands, small bets, no bluffs, and she folds at the first sign of trouble.',
  ),
  nervousPragmatist: sheet(
    'Joanna',
    'a blunt, slightly anxious mechanic',
    'Joanna fixes cars and says what she thinks. Down to earth and a bit sloppy, she worries quickly when things go wrong.',
    'Fairly tight and a little aggressive, she bluffs a bit with bigger bets and folds under pressure.',
  ),
  curiousOptimist: sheet(
    'Paula',
    'a curious, confident optimist',
    'Paula has tried every hobby once and most of them twice. Sure of herself and a little blunt, she is rarely down for long.',
    'Loose and aggressive, she bluffs a fair amount with solid bets and likes to see hands through.',
  ),
  noisyBully: sheet(
    'Roxy',
    'a noisy, self-assured bully',
    "Roxy fills a room and expects it to make space for her. Loud and careless of other people's feelings, she loves to win out loud.",
    'Loose and aggressive: lots of hands, lots of pressure and frequent big bluffs.',
  ),
  plainRealist: sheet(
    'Susan',
    'a plain, down-to-earth realist',
    'Susan works the till at a garden centre and likes things as they are. Sensible and a little conservative, she is unremarkable by choice.',
    'A little tight and a little passive, close to the textbook and never flashy.',
  ),
  quietTidy: sheet(
    'Elin',
    'a quiet, tidy, kind soul',
    'Elin keeps a neat flat and a neat diary. Gentle, reserved and calm, she likes order and dislikes fuss.',
    'Tight and passive with small bets and few bluffs, but she sees a hand through once she is in.',
  ),
  softMiddle: sheet(
    'Laura',
    'a soft, calm accountant',
    'Laura keeps the books for a dental practice and likes her weekends quiet. Kind and steady, she is moderate in everything.',
    'Close to the textbook, a touch passive: she bluffs a little less and calls a little more.',
  ),
  calmCurious: sheet(
    'Ada',
    'a calm, curious museum guide',
    'Ada asks questions for a living and never tires of the answers. Curious and serene, she wants to know how every story ends.',
    'She plays lots of hands without much aggression and calls them down to the end.',
  ),
  reservedConservative: sheet(
    'Ruth',
    'a reserved, traditional choir singer',
    'Ruth has sung in the church choir for thirty years and kept the same haircut for as long. Reserved and careful, she trusts what she knows.',
    'A rock: tight and passive, small bets and few bluffs.',
  ),
  neutral: sheet(
    'Eva',
    'an average person in every trait',
    'Eva is the reference of the debug panel: every trait sits in the middle, so at rest she plays the blueprint.',
    'The blueprint at rest, moved only by what she feels.',
  ),
};
