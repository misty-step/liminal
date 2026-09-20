# Puzzle validation matrix

Generated from `src/lib/liminal/deck.ts` — the same data the executable tests assert.
A verified answer yields Inside on every condition. A near miss yields Close on
exactly the listed condition and Inside elsewhere. Both are enforced by
`__tests__/deck.test.ts` (61-test suite).

## The Vessel in the Wall (bath-vessel, literal)

| answer | kind | c1 | c2 | c3 |
| --- | --- | --- | --- | --- |
| sink | verified answer | inside | inside | inside |
| bathtub | verified answer | inside | inside | inside |
| washbasin | verified answer | inside | inside | inside |
| toilet | verified answer | inside | inside | inside |
| kitchen sink | near miss (fails c1) | close | inside | inside |
| shampoo bottle | near miss (fails c2) | inside | close | inside |
| faucet | near miss (fails c3) | inside | inside | close |
| shower head | near miss (fails c3) | inside | inside | close |

Conditions: c1 = Commonly found in a bathroom; c2 = Plumbed in — it has a drain or pipes; c3 = It can hold a pool of water

Clue-echo rejection sample: "commonly found in a bathroom" -> echo

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
| aquarium | near miss (fails c2) | inside | close | inside |
| watering can | near miss (fails c2) | inside | close | inside |
| barrel | near miss (fails c2) | inside | close | inside |
| vase | near miss (fails c2) | inside | close | inside |
| bucket | near miss (fails c2) | inside | close | inside |

Conditions: c1 = A container; c2 = Found in a kitchen; c3 = Can hold liquid without leaking

Clue-echo rejection sample: "container" -> echo

## Made and Taken (made-and-taken, wordplay)

| answer | kind | c1 | c2 | c3 |
| --- | --- | --- | --- | --- |
| decision | verified answer | inside | inside | inside |
| phone call | verified answer | inside | inside | inside |
| wrong turn | verified answer | inside | inside | inside |
| u-turn | verified answer | inside | inside | inside |
| apology | verified answer | inside | inside | inside |
| cake | near miss (fails c3) | inside | inside | close |
| pie | near miss (fails c3) | inside | inside | close |
| sandwich | near miss (fails c3) | inside | inside | close |
| salad | near miss (fails c3) | inside | inside | close |

Conditions: c1 = You can make it — people really say this; c2 = You can take it — people really say this; c3 = It is not a physical object

Clue-echo rejection sample: "you can make it people really say this" -> echo

## Pass or Fail (pass-or-fail, wordplay)

| answer | kind | c1 | c2 | c3 |
| --- | --- | --- | --- | --- |
| audition | verified answer | inside | inside | inside |
| interview | verified answer | inside | inside | inside |
| drug test | verified answer | inside | inside | inside |
| driving test | verified answer | inside | inside | inside |
| checkup | verified answer | inside | inside | inside |
| launch | near miss (fails c1) | close | inside | inside |
| takeover | near miss (fails c1) | close | inside | inside |
| rescue | near miss (fails c1) | close | inside | inside |

Conditions: c1 = You can pass it — clear it, succeed at it; c2 = You can fail it; c3 = It is something that happens — not a thing you could touch

Clue-echo rejection sample: "you can pass it clear it succeed at it" -> echo

