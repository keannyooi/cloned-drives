# Test tracks (v2 format) — `src/rrtest/`

Tracks in this folder are **only** raced by the sandbox command (`cd-testrace`).
Random Race, events, Pace Index and PvP never see them. The live pool in
`src/tracks/` is untouched.

One file = one **layout**. The weather and surface variants live in the file's
`conditions` list; the loader expands them into runtime tracks, so the old
"(Dirt)" and "(Muddy)" copies become two lines in one file.

**Nothing in a v2 file is typed by feel.** You describe the layout with things
you can count on a map — corners by type, straights, the start, the net climb
— and the engine works out how much of a lap is launch, pull, flat-out,
corners and braking by lapping it with a fixed reference car. The validator
shows you those shares as you write the file:

```
node scripts/raceModel/validateTracks.js
```

## Fields

| Field | Required | Meaning |
|---|---|---|
| `layoutID` | yes | `rt00001` … — never collides with live `tXXXXX` ids. Variants get `rt00001:dry` |
| `name` | yes | the layout's name **without** a weather suffix; the condition `label` is appended for display |
| `kind` | yes | `circuit` · `street` · `stage` · `hillclimb` · `drag` · `slalom` · `oval` · `timeTrial` · `mphTarget` · `rallycross` |
| `country` | yes unless `fictional: true` | two-letter code, same as the car files (`KE`, `FI`, `DE`) |
| `city`, `realName` | no | display only, never matched by anything |
| `fictional` | no | `true` for Choco Mountain, City Streets and friends; then `country` may be omitted |
| `distance` | yes (not for `mphTarget` / `timeTrial`) | **miles**. A quarter mile is `0.25`, the Nordschleife `12.9` |
| `opened` | no | year the venue opened — lets drivers of an era fire only on venues that existed |
| `altitude` | no | **feet** (Pikes Peak summit `14115`) — thin air for combustion engines, later |
| `tags` | no | words drivers and events can match: `WRC`, `F1`, `Dakar`, `Touge`, `Group B` … |
| `obstacles` | no | `{ "speedbumps": n, "humps": n }` counts, as the live files have. A hump is the game's word for big rocks and rough obstacles a low car cannot take at speed (not a crest): the engine makes each one a stretch of road held at a speed limit by clearance, walking pace for Low |
| `layout` | yes (not for `mphTarget` / `timeTrial`) | the countable facts — see below |
| `mphTarget` | only for `mphTarget` | `{ "start": 0, "end": 100 }` in mph — no more parsing the name |
| `conditions[]` | yes, ≥ 1 | each: `id` (short, unique), `label` (display suffix, e.g. `Dirt`, `Muddy`, `Sunny`), `surface`, `weather`, optional `equivalentTrackID` (the live file this variant replaces — `cd-testrace` uses it to show the current engine's verdict side by side), optional `obstacles` override, optional `start` override (`standing` / `rolling`), optional `mix` (**mixed surfaces**: `{ "Gravel": 0.4 }` = 40% of the lap's segments run on gravel, spread evenly — the rallycross field), optional `background` / `map` (artwork that differs by weather). **Nothing else** — the geometry never varies by weather |
| `background`, `map`, `creator` | yes / yes / no | as today, one set per layout |
| `notes` | no | anything the next person should know: what was traced from a map, what was estimated |

Weather + surface must be a pair the engine knows: Sunny/Rainy × Asphalt,
Track, Drag, Gravel, Dirt; Sunny × Sand, Snow, Ice; TT × OnRoad/OffRoad.

## The `layout` block — count, don't judge

```json
"layout": {
    "start": "standing",
    "corners": { "tight": 12, "medium": 28, "fast": 20 },
    "straights": { "count": 60, "longest": 1.4 },
    "netClimb": 0
}
```

| Fact | How to get it |
|---|---|
| `start` | the layout's default: `standing` for stages, drags, hill climbs, slaloms and MPH runs; `rolling` for circuits and ovals (the lap feeds itself). A condition may override it, so a circuit can offer both a race start and a flying lap; the shares are computed per variant |
| `corners` | count them on the map, by the speed a normal sports car carries through: **tight** under about 40 mph (hairpins, chicanes, 90° city corners), **medium** 40–80 (the ordinary corner), **fast** over 80 (sweepers, kinks taken with a lift). A drag strip has zeros |
| `straights` | either the list of lengths in miles, `[0.7, 0.6, 0.5, …]`, when you have the map — or `{ "count": n, "longest": x }` when you only know how many there are and the big one; the rest then share the remaining distance equally |
| `netClimb` | **feet**, finish minus start. `0` for a circuit, `4720` for Pikes Peak, negative for a downhill. Leave it `0` when you have not looked it up and say so in `notes` |

Circuits and their corner counts and lengths are on Wikipedia and the circuit
maps; rally stages and fictional tracks get counted from the map or drawn
like a track editor. Approximate counts are fine for the sandbox — say so in
`notes` — and they are still a fact someone can check against the map, which
a percentage never was.

The corner speeds and arc lengths, and the reference car that does the
lapping, are engine constants in `src/util/functions/trackV2.js`. Change
them there and every track's shares move together.

## What the shares mean (so the validator's output reads as "what matters here")

| Phase | The lap | Rewards |
|---|---|---|
| `launch` | a standing start, up to 60 mph | 0-30 / 0-60, traction (drive, tyres, TCS off dry tarmac) |
| `pull` | accelerating between corners below flat-out speed | the 0-100 curve, MRA, power to weight, traction, gradient |
| `flatOut` | at or near top speed | top speed and power |
| `corners` | steady cornering | handling × tyre grip on the surface × agility |
| `transitions` | braking into corners and direction changes | the same grip plus mass, ABS in the wet |

## Rules of thumb

- **Distance in miles, climb and altitude in feet** — everything in the game is imperial.
- Store nothing derivable: region comes from `country`, length class from
  `distance`, the longest straight is in the straights, the shares are computed.
- Only enums, tags and ranges are ever matched by drivers or events; free text
  (`city`, `realName`, `notes`) is display only.
- There is no `specsDistr`, no `phases`, no `cornerMix`, no `elevation` class
  in v2 — the validator rejects them.

See `rt00001.json` (Kenya Safari Rally Route) for a complete example, and
`docs/race-engine-rework.md` §3.3a for the reasoning.
