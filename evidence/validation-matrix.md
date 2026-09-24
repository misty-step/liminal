# Puzzle validation matrix

Generated from `src/lib/liminal/deck.ts` — the same data the executable tests assert.
A center answer yields Inside on every condition. A pair answer yields Outside on
exactly the condition its region excludes and Inside elsewhere, so it fills that
region. Both are enforced by `__tests__/deck.test.ts`.

## bath-vessel (literal)

Circles: c1 = Found in a bathroom; c2 = Plumbed in; c3 = Holds a pool of water

| answer | region | c1 | c2 | c3 | lands in |
| --- | --- | --- | --- | --- | --- |
| faucet | outside c3 | inside | inside | outside | outside c3 |
| shower head | outside c3 | inside | inside | outside | outside c3 |
| tap | outside c3 | inside | inside | outside | outside c3 |
| baby bath | outside c2 | inside | outside | inside | outside c2 |
| toothbrush cup | outside c2 | inside | outside | inside | outside c2 |
| tooth mug | outside c2 | inside | outside | inside | outside c2 |
| kitchen sink | outside c1 | outside | inside | inside | outside c1 |
| hot tub | outside c1 | outside | inside | inside | outside c1 |
| swimming pool | outside c1 | outside | inside | inside | outside c1 |
| sink | center | inside | inside | inside | center |
| bathtub | center | inside | inside | inside | center |
| washbasin | center | inside | inside | inside | center |
| toilet | center | inside | inside | inside | center |

Label-echo refusal sample: "Found in a bathroom" -> echo

## shell-water-eat (literal)

Circles: c1 = Has a shell; c2 = Lives in water; c3 = You can eat it

| answer | region | c1 | c2 | c3 | lands in |
| --- | --- | --- | --- | --- | --- |
| sea turtle | outside c3 | inside | inside | outside | outside c3 |
| nautilus | outside c3 | inside | inside | outside | outside c3 |
| egg | outside c2 | inside | outside | inside | outside c2 |
| walnut | outside c2 | inside | outside | inside | outside c2 |
| peanut | outside c2 | inside | outside | inside | outside c2 |
| coconut | outside c2 | inside | outside | inside | outside c2 |
| salmon | outside c1 | outside | inside | inside | outside c1 |
| tuna | outside c1 | outside | inside | inside | outside c1 |
| squid | outside c1 | outside | inside | inside | outside c1 |
| seaweed | outside c1 | outside | inside | inside | outside c1 |
| crab | center | inside | inside | inside | center |
| lobster | center | inside | inside | inside | center |
| oyster | center | inside | inside | inside | center |
| clam | center | inside | inside | inside | center |
| mussel | center | inside | inside | inside | center |

Label-echo refusal sample: "Has a shell" -> echo

## wheels-motor-ride (literal)

Circles: c1 = Has wheels; c2 = Has a motor; c3 = You can ride it

| answer | region | c1 | c2 | c3 | lands in |
| --- | --- | --- | --- | --- | --- |
| robot vacuum | outside c3 | inside | inside | outside | outside c3 |
| remote-control car | outside c3 | inside | inside | outside | outside c3 |
| robot lawnmower | outside c3 | inside | inside | outside | outside c3 |
| bicycle | outside c2 | inside | outside | inside | outside c2 |
| skateboard | outside c2 | inside | outside | inside | outside c2 |
| wagon | outside c2 | inside | outside | inside | outside c2 |
| roller skates | outside c2 | inside | outside | inside | outside c2 |
| jet ski | outside c1 | outside | inside | inside | outside c1 |
| snowmobile | outside c1 | outside | inside | inside | outside c1 |
| motorboat | outside c1 | outside | inside | inside | outside c1 |
| car | center | inside | inside | inside | center |
| motorcycle | center | inside | inside | inside | center |
| bus | center | inside | inside | inside | center |
| tractor | center | inside | inside | inside | center |
| go-kart | center | inside | inside | inside | center |

Label-echo refusal sample: "Has wheels" -> echo

## keys-music-carry (literal)

Circles: c1 = Has keys; c2 = Made for music; c3 = Easy to carry

| answer | region | c1 | c2 | c3 | lands in |
| --- | --- | --- | --- | --- | --- |
| piano | outside c3 | inside | inside | outside | outside c3 |
| organ | outside c3 | inside | inside | outside | outside c3 |
| harpsichord | outside c3 | inside | inside | outside | outside c3 |
| calculator | outside c2 | inside | outside | inside | outside c2 |
| computer keyboard | outside c2 | inside | outside | inside | outside c2 |
| guitar | outside c1 | outside | inside | inside | outside c1 |
| harmonica | outside c1 | outside | inside | inside | outside c1 |
| violin | outside c1 | outside | inside | inside | outside c1 |
| ukulele | outside c1 | outside | inside | inside | outside c1 |
| accordion | center | inside | inside | inside | center |
| melodica | center | inside | inside | inside | center |
| keytar | center | inside | inside | inside | center |
| toy piano | center | inside | inside | inside | center |

Label-echo refusal sample: "Has keys" -> echo

## head-and-foot (wordplay)

Circles: c1 = Has a head; c2 = Has a foot; c3 = Isn't alive

| answer | region | c1 | c2 | c3 | lands in |
| --- | --- | --- | --- | --- | --- |
| person | outside c3 | inside | inside | outside | outside c3 |
| dog | outside c3 | inside | inside | outside | outside c3 |
| bird | outside c3 | inside | inside | outside | outside c3 |
| chicken | outside c3 | inside | inside | outside | outside c3 |
| nail | outside c2 | inside | outside | inside | outside c2 |
| hammer | outside c2 | inside | outside | inside | outside c2 |
| pin | outside c2 | inside | outside | inside | outside c2 |
| coin | outside c2 | inside | outside | inside | outside c2 |
| screw | outside c2 | inside | outside | inside | outside c2 |
| footstool | outside c1 | outside | inside | inside | outside c1 |
| ladder | outside c1 | outside | inside | inside | outside c1 |
| bed | center | inside | inside | inside | center |
| table | center | inside | inside | inside | center |
| page | center | inside | inside | inside | center |
| column | center | inside | inside | inside | center |

Label-echo refusal sample: "Has a head" -> echo

## tail-fly-alive (literal)

Circles: c1 = Has a tail; c2 = Can fly; c3 = Is alive

| answer | region | c1 | c2 | c3 | lands in |
| --- | --- | --- | --- | --- | --- |
| kite | outside c3 | inside | inside | outside | outside c3 |
| airplane | outside c3 | inside | inside | outside | outside c3 |
| rocket | outside c3 | inside | inside | outside | outside c3 |
| dog | outside c2 | inside | outside | inside | outside c2 |
| cat | outside c2 | inside | outside | inside | outside c2 |
| cow | outside c2 | inside | outside | inside | outside c2 |
| lion | outside c2 | inside | outside | inside | outside c2 |
| moth | outside c1 | outside | inside | inside | outside c1 |
| mosquito | outside c1 | outside | inside | inside | outside c1 |
| bird | center | inside | inside | inside | center |
| bat | center | inside | inside | inside | center |
| parrot | center | inside | inside | inside | center |
| eagle | center | inside | inside | inside | center |

Label-echo refusal sample: "Has a tail" -> echo

