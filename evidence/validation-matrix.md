# Puzzle validation matrix

Generated from `src/lib/liminal/deck.ts` — the same data the executable tests assert.
A verified answer yields Inside on every condition. A near miss yields Close on
exactly the listed condition and Inside elsewhere. Both are enforced by
`__tests__/deck.test.ts` (51-test suite).

## The Pocket Relic (pocket-relic, literal)

| answer | kind | c1 | c2 | c3 |
| --- | --- | --- | --- | --- |
| pebble | verified answer | inside | inside | inside |
| marble | verified answer | inside | inside | inside |
| coin | verified answer | inside | inside | inside |
| bead | verified answer | inside | inside | inside |
| gemstone | verified answer | inside | inside | inside |
| ring | verified answer | inside | inside | inside |
| key | verified answer | inside | inside | inside |
| boulder | near miss (fails c1) | close | inside | inside |
| sponge | near miss (fails c2) | inside | close | inside |
| glass shard | near miss (fails c3) | inside | inside | close |
| nail | near miss (fails c3) | inside | inside | close |
| geode | near miss (fails c3) | inside | inside | close |

Conditions: c1 = A small physical object — it fits in a closed hand; c2 = Made of stone, metal, or glass; c3 = Worn smooth by time or handling — not sharp, not rough

Clue-echo rejection sample: "small physical object it fits in a closed hand" -> echo

## The Kitchen Well (kitchen-well, literal)

| answer | kind | c1 | c2 | c3 |
| --- | --- | --- | --- | --- |
| mug | verified answer | inside | inside | inside |
| teapot | verified answer | inside | inside | inside |
| pitcher | verified answer | inside | inside | inside |
| kettle | verified answer | inside | inside | inside |
| jar | verified answer | inside | inside | inside |
| jug | verified answer | inside | inside | inside |
| bowl | verified answer | inside | inside | inside |
| bottle | verified answer | inside | inside | inside |
| pan | verified answer | inside | inside | inside |
| wok | verified answer | inside | inside | inside |
| colander | near miss (fails c3) | inside | inside | close |
| sieve | near miss (fails c3) | inside | inside | close |
| basket | near miss (fails c3) | inside | inside | close |
| sponge | near miss (fails c1) | close | inside | inside |
| funnel | near miss (fails c3) | inside | inside | close |

Conditions: c1 = A container; c2 = Found in a kitchen; c3 = Can hold liquid without leaking

Clue-echo rejection sample: "container" -> echo

## Hidden Measures (hidden-measures, wordplay)

| answer | kind | c1 | c2 | c3 |
| --- | --- | --- | --- | --- |
| wheelbarrow | verified answer | inside | inside | inside |
| windmill | verified answer | inside | inside | inside |
| treadmill | verified answer | inside | inside | inside |
| trampoline | verified answer | inside | inside | inside |
| lampshade | verified answer | inside | inside | inside |
| lamppost | verified answer | inside | inside | inside |
| cupcake | near miss (fails c3) | inside | inside | close |
| inchworm | near miss (fails c3) | inside | inside | close |
| graveyard | near miss (fails c3) | inside | inside | close |
| kilogram | near miss (fails c2) | inside | close | inside |
| amphora | near miss (fails c3) | inside | inside | close |
| campsite | near miss (fails c1) | close | inside | inside |

Conditions: c1 = A real, recognizable thing — not a person, place, or action; c2 = Its name hides a unit of measurement in consecutive letters; c3 = The hidden unit is not at the start or end of the name

Clue-echo rejection sample: "real recognizable thing not a person place or action" -> echo

## Silent Partners (silent-partners, wordplay)

| answer | kind | c1 | c2 | c3 |
| --- | --- | --- | --- | --- |
| castle | verified answer | inside | inside | inside |
| whistle | verified answer | inside | inside | inside |
| comb | verified answer | inside | inside | inside |
| thumb | verified answer | inside | inside | inside |
| sandwich | verified answer | inside | inside | inside |
| chalk | verified answer | inside | inside | inside |
| salmon | verified answer | inside | inside | inside |
| yolk | verified answer | inside | inside | inside |
| tomb | verified answer | inside | inside | inside |
| bomb | verified answer | inside | inside | inside |
| handkerchief | verified answer | inside | inside | inside |
| knife | near miss (fails c3) | inside | inside | close |
| gnome | near miss (fails c3) | inside | inside | close |
| hourglass | near miss (fails c3) | inside | inside | close |
| wristwatch | near miss (fails c3) | inside | inside | close |
| listen | near miss (fails c1) | close | inside | inside |

Conditions: c1 = A real, recognizable thing — not a person, place, or action; c2 = Its name contains a silent letter; c3 = The silent letter is not the first letter of the name

Clue-echo rejection sample: "real recognizable thing not a person place or action" -> echo

