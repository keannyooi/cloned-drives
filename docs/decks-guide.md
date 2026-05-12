# Decks — Quick Guide

Saved decks let you lock in a 5-car lineup once and re-use it in PvP events without rebuilding it every match.

A deck has:
- A name (your choice — up to 32 chars, no `|`)
- 5 slots (each holds one car at a specific tune)

You can save up to **25 decks** per profile. Slots can be left empty during construction, but a deck is only "ready for PvP" once **all 5 slots are filled**.

---

## Common workflow

```
cd-deck create Speed Demons
cd-deck setslot Speed Demons | 1 | Ferrari SF-25
cd-deck setslot Speed Demons | 2 | Lamborghini Huracán
cd-deck setslot Speed Demons | 3 | Porsche 911 GT3
cd-deck setslot Speed Demons | 4 | McLaren P1
cd-deck setslot Speed Demons | 5 | Bugatti Chiron
cd-deck show Speed Demons
```

Then in PvP:
```
cd-pvpplay Ferrari Frenzy deck Speed Demons
```

(Replaces the interactive 5-step car picker.)

---

## All subcommands

| Command | What it does |
|---|---|
| `cd-deck` | List your decks (alias for `cd-deck list`) |
| `cd-deck list` | Same — shows all decks with their fill status |
| `cd-deck create <name>` | Create an empty 5-slot deck |
| `cd-deck show <name>` | View a deck's contents |
| `cd-deck delete <name>` | Delete a deck (with confirmation) |
| `cd-deck rename <old> \| <new>` | Rename |
| `cd-deck setslot <deck> \| <slot 1–5> \| <car name>` | Pick a car from your garage for that slot |
| `cd-deck clearslot <deck> \| <slot 1–5>` | Empty a slot |
| `cd-deck swap <deck> \| <slot1> \| <slot2>` | Swap two slots |

> The `|` (pipe) is the delimiter for multi-arg subcommands. Deck names can contain spaces but **not** pipes.

---

## How `setslot` works

When you run `cd-deck setslot Speed Demons | 1 | Ferrari SF-25`:

1. The bot fuzzy-searches your **garage** for cars matching "Ferrari SF-25". If multiple match, you'll get a select menu.
2. Once a car is picked, you're asked to pick a **tune** (000 / 333 / 666 / 699 / 969 / 996). If you only own one tune, it auto-picks. If you own several, you choose.
3. The car + tune is saved into the slot.

You must currently own **at least 1 copy** of the car at the chosen tune. If you don't, `setslot` errors out.

---

## What happens when a saved car is sold/fused/upgraded

Because saved decks reference specific car+tune combos, they'll auto-update when your garage changes:

- **Sold all copies of car X at tune T** → that slot becomes empty (`null`). Deck is now incomplete and can't be used in PvP until you fill the slot again.
- **Upgraded car X from tune T→T'** → slot updates to point to T' (you didn't lose the car, just changed its tune).
- **Removed via admin** → same as sold.

You'll see this on `cd-deck show <name>` — incomplete slots show as `_(empty)_`.

---

## Using a deck in PvP

Once a deck has all 5 slots filled, you can use it in any active PvP event with:

```
cd-pvpplay <event name> deck <deck name>
```

Validation runs at play time:
- Every slot must still be owned at the saved tune
- Every car must meet the **event's reqs** (CR range, country, tags, etc.)

If anything fails, the bot tells you which slot/car is the problem so you can edit the deck or pick a different one.

If you don't pass `deck <name>`, you'll go through the interactive 5-step picker instead — pick each car from your garage one at a time.

---

## Tips

- **Build decks for specific events.** PvP events restrict cars by reqs (e.g., "Japanese cars only, CR 250–380"). Build one deck per event theme so you can play any active event in seconds.
- **Slot order matters.** In PvP your slot N races the opponent's slot N. The Match Review screen lets you swap pairs before locking in, but starting with a sensible order saves time.
- **Use `swap` for tweaks.** Don't `clearslot` + `setslot` if you just want to reorder — `cd-deck swap MyDeck | 1 | 5` is one command.
- **Show after every change.** `cd-deck show <name>` is the fastest way to verify your deck looks right.
