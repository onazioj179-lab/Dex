// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Password Generator+ core. Pure functions over an injectable random source so
 * they can be tested deterministically; the app passes `cryptoRandom`.
 *
 * - Every index comes from rejection sampling, so there is no modulo bias.
 * - A password contains at least one character from each selected class.
 * - Entropy is the generator's real search space (choices made), not a guess
 *   from the finished string.
 * - Nothing here logs, stores or transmits a generated value.
 */

/** Returns `n` uniformly random 32-bit unsigned integers. */
export type RandomSource = (n: number) => Uint32Array;

export const cryptoRandom: RandomSource = (n) => {
  const out = new Uint32Array(n);
  crypto.getRandomValues(out);
  return out;
};

/** Uniform integer in [0, n) by rejection sampling (no modulo bias). */
export function randomIndex(n: number, rand: RandomSource): number {
  if (!Number.isInteger(n) || n <= 0 || n > 2 ** 32) throw new RangeError('n must be a positive integer');
  const limit = Math.floor(2 ** 32 / n) * n; // largest multiple of n below 2^32
  for (;;) {
    const [v] = rand(1);
    if (v < limit) return v % n;
  }
}

export const CHARSETS = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/',
} as const;

/** Characters that are easy to misread: 0/O/o and 1/l/I/|. */
export const AMBIGUOUS = new Set('0Oo1lI|'.split(''));

export type CharClass = keyof typeof CHARSETS;

export interface PasswordOptions {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
}

export interface Generated {
  value: string;
  /** Bits of entropy in the generator's choice. */
  entropyBits: number;
}

export const MIN_LENGTH = 8;
export const MAX_LENGTH = 128;

function poolsFor(opts: PasswordOptions): string[] {
  const classes: CharClass[] = (['upper', 'lower', 'digits', 'symbols'] as CharClass[]).filter(c => opts[c]);
  return classes
    .map(c => (opts.excludeAmbiguous ? [...CHARSETS[c]].filter(ch => !AMBIGUOUS.has(ch)).join('') : CHARSETS[c]))
    .filter(p => p.length > 0);
}

/** Generate a random password. Throws if no character class is selected. */
export function generatePassword(opts: PasswordOptions, rand: RandomSource = cryptoRandom): Generated {
  const pools = poolsFor(opts);
  if (pools.length === 0) throw new Error('Select at least one character type.');
  const length = Math.max(MIN_LENGTH, Math.min(MAX_LENGTH, Math.round(opts.length)), pools.length);
  const all = pools.join('');
  // One from each selected class, the rest from the combined pool, then shuffle.
  const chars = pools.map(p => p[randomIndex(p.length, rand)]);
  while (chars.length < length) chars.push(all[randomIndex(all.length, rand)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, rand);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return { value: chars.join(''), entropyBits: passwordSpaceBits(length, pools) };
}

/**
 * log2 of the number of distinct passwords the generator can produce: strings
 * of `length` over the combined pool that contain at least one character of
 * each class (inclusion-exclusion over the classes left out).
 */
export function passwordSpaceBits(length: number, pools: string[]): number {
  const sizes = pools.map(p => p.length);
  const k = sizes.length;
  let count = 0;
  for (let mask = 0; mask < 1 << k; mask++) {
    let size = 0;
    let missing = 0;
    for (let i = 0; i < k; i++) {
      if (mask & (1 << i)) missing++;
      else size += sizes[i];
    }
    count += (missing % 2 ? -1 : 1) * Math.pow(size, length);
  }
  // For long passwords the leading term dominates and the sum loses precision.
  const total = sizes.reduce((a, b) => a + b, 0);
  return count > 0 && Number.isFinite(count) ? Math.log2(count) : length * Math.log2(total);
}

export interface PassphraseOptions {
  words: number;
  separator: string;
  capitalize: boolean;
  includeNumber: boolean;
}

export const MIN_WORDS = 4;
export const MAX_WORDS = 12;

/** Generate a passphrase from WORDS. */
export function generatePassphrase(opts: PassphraseOptions, rand: RandomSource = cryptoRandom): Generated {
  const count = Math.max(MIN_WORDS, Math.min(MAX_WORDS, Math.round(opts.words)));
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    const w = WORDS[randomIndex(WORDS.length, rand)];
    picked.push(opts.capitalize ? w[0].toUpperCase() + w.slice(1) : w);
  }
  let bits = count * Math.log2(WORDS.length);
  if (opts.includeNumber) {
    const slot = randomIndex(count, rand);
    picked[slot] += String(randomIndex(10, rand));
    bits += Math.log2(10) + Math.log2(count);
  }
  return { value: picked.join(opts.separator), entropyBits: bits };
}

export type StrengthLabel = 'Weak' | 'Fair' | 'Strong' | 'Very strong';

/** Strength from entropy bits: under 50 weak, 50-69 fair, 70-99 strong, 100+ very strong. */
export function strengthFor(bits: number): { label: StrengthLabel; tier: 1 | 2 | 3 | 4 } {
  if (bits < 50) return { label: 'Weak', tier: 1 };
  if (bits < 70) return { label: 'Fair', tier: 2 };
  if (bits < 100) return { label: 'Strong', tier: 3 };
  return { label: 'Very strong', tier: 4 };
}

/** Short common English words (3-9 letters, lowercase, unique). */
export const WORDS: readonly string[] = `
able acid acorn actor adapt admit adult agent agree ahead aim air alarm album alert alien alley
allow almond alpha amber amount anchor angle animal ankle answer apple april apron arch arena
argue arm armor army arrow art artist ash aspen atlas atom attic audio august aunt autumn avid
awake award axis baby bacon badge bag baker bakery balance ball bamboo banana band bank barn
barrel basic basin basket bath beach beacon beam bean bear beaver bed bee beetle begin bell belt
bench berry bicycle bike birch bird biscuit bison blade blank blanket blaze blend bless blink
block bloom blossom blue blush board boat body bolt bonus book boost boot border bottle boulder
bounce bow bowl box brain branch brass brave bread breeze brick bridge brief bright brisk brook
broom brother brush bubble bucket budget buffalo bugle build bulb bundle bunny burst bus bush
butter button buzz cabin cable cactus cake calm camel camera camp canal candle candy cannon
canoe canvas canyon cape captain car carbon card cargo carpet carrot cart castle cat cattle cave
cedar ceiling celery cell cellar center cereal chain chair chalk champ chapel charm chart chase
cheese chef cherry chess chest chicken chief child chimney chin chip choice chorus circle citrus
city civic claim clam clap clay clean clerk clever cliff climb clinic clock cloth cloud clover
club coach coast coat cobalt cocoa coconut code coffee coin cola collar color comet comfort
comic common compass cook copper coral cord corn corner cotton couch country course cousin cover
cow coyote crab cradle craft crane crater crayon cream credit creek crew cricket crisp crop
cross crowd crown crumb crystal cube cuckoo cup curve cushion cycle daisy dance dawn day deck
deer degree delta denim depth desert desk detail dial diary diesel digit dinner direct dish dive
dock doctor dog dollar dolphin dome donkey door dot double dove dragon drama draw dream dress
drift drill drink drive drum duck dune dusk dust eagle early earth easel east echo edge eel
effort egg eight elbow elder element elephant elk elm ember emerald empty energy engine enjoy
entry envoy equal error escape essay evening event exact exit expert extra eye fabric face
factor fair falcon family fan farm fashion feast feather fence fern ferry festival fiber field
fig film final finch finger fire fish fit flag flame flash flat fleet flight flint float flock
flood floor flour flower flute foam focus fog folder food foot forest fork form fort forum
fossil fox frame fresh friend frog frost fruit fuel future gadget galaxy gallery game garage
garden garlic gas gate gather gauge gear gecko gem general gentle giant gift ginger giraffe
glacier glad glass glide globe glove glow goat gold golf good goose gorilla gospel grain grape
graph grass gravel gravity green grid grill grove guard guest guide guitar gull gym habit hair
hall hammer hamster hand handle happy harbor harp harvest hat hawk hazel head health heart hedge
height helmet herb hero heron hill hint hippo history hobby hockey holiday honey hood hook hope
horizon horn horse host hotel hour house hub humble humor hunt hurry hut ice icon idea igloo
image impact inch index ink inlet insect island item ivory ivy jacket jaguar jam jar jazz jeans
jelly jewel job jockey join joke journal journey joy judge juice jungle junior jury kale kayak
keen kettle key kid kidney kind king kiosk kit kitchen kite kitten kiwi knee knife knot koala
label lace ladder lake lamb lamp land lane lantern laptop large laser latch laugh lava lawn
layer leaf lemon lens leopard letter level library lid light lilac lily limb lime linen lion
liquid list little lizard llama lobby lobster local lock locust lodge logic lotus loud lounge
loyal lucky lunar lunch machine magnet mango maple marble march margin market marsh mask mason
master match maze meadow medal melody melon member memory menu merit mesh metal meteor method
middle milk mill mineral minute mirror mist mitten mix model modem moment monkey month moon
moose morning mosaic moss motor mountain mouse mouth movie mud muffin mule museum music mustard
myth nail name napkin narrow nation nature navy near neck needle nephew nest net never new night
noble noodle north nose note novel number nurse nut nutmeg oak oasis oat object ocean octave
october office olive omega onion open opera orange orbit orchard orchid order organ origin otter
outdoor oval oven owl owner oxygen oyster paddle page paint palace palm panda panel panther
paper parade parcel park parrot party pass pasta path patio pause peach peanut pear pebble pecan
pedal pelican pen pencil penguin pepper piano picnic piece pig pigeon pillow pilot pine pink
pioneer pipe pirate pistachio pitch pizza place plain planet plant plate play plaza plenty plum
pocket poem poet polar pond pony pool poplar poppy porch port portal potato pottery powder power
prairie press price prince print prism prize program proof proud pudding pulse pumpkin pupil
puppy purple puzzle pyramid quail quake quarter quartz queen quest quick quiet quill quilt quiz
quote rabbit raccoon race radar radio radish raft rail rain rainbow raisin rake ranch range
rapid raven razor ready recipe record reef region relay remote rescue resort rhythm ribbon rice
ridge rifle ring ripple river road robin robot rocket rodeo roof room root rope rose rotor round
route rover royal rubber ruby rug ruler runway rural saddle safari safe saga sail salad salmon
salt sample sand sandal satin sauce sausage saw scale scarf scene school science scoop scout
screen script sea seal season seat second secret seed shadow shark sheep shelf shell shelter
sheriff shield ship shirt shoe shore shovel shrimp signal silk silver simple siren sister sketch
ski skill skirt sky slate sled sleeve slice slope smile smoke snack snail snake snow soap soccer
sock sofa soil solar soldier solid song sound soup south space spark sparrow spice spider spike
spine spirit sponge spoon sport spring sprout spruce square squid stable stadium staff stage
stairs stamp star station statue steam steel stem step stick stone stool storm story stove straw
stream street string stripe studio sugar suit summer summit sun sunset supply surf swan sweater
swift swing symbol syrup system table tablet tackle tail talent tango tank tape target taxi tea
teacher team tennis tent term thread throne thunder ticket tide tiger timber time tin tiny title
toast today token tomato tone tool topaz torch tortoise total tower town toy track tractor trade
trail train travel tray treasure tree trend tribe trophy truck trumpet trunk tulip tuna tunnel
turkey turtle tutor twig twin umbrella uncle under unicorn union unit universe update upper
urban usual utensil vacuum valley valve van vanilla vapor vase vault vector velvet vendor venue
verse vessel vest video view village vine violet violin visit vivid voice volcano volume vote
voyage wafer wagon waist walnut walrus wand warm water wave wax weasel weather web wedge whale
wheat wheel whisper whistle wide willow wind window wing winter wire wisdom wizard wolf wonder
wood wool word world worth wren wrist yacht yak yard yarn year yellow yield yoga yogurt young
youth zebra zero zest zinc zone zoo
`.trim().split(/\s+/);
