# Events Guide

Quick reference for creating and managing events in Cloned Drives.

---

## Command Overview

| Command | Aliases | What it does |
|---------|---------|-------------|
| `cd-createevent` | `cd-newevent` | Create a new event |
| `cd-editevent` | | Edit event rounds, rewards, requirements |
| `cd-startevent` | `cd-launchevent` | Activate an event (goes live) |
| `cd-endevent` | `cd-removeevent`, `cd-rmvevent` | End and archive an event |
| `cd-events` | `cd-e`, `cd-event` | View active/inactive events |
| `cd-playevent` | `cd-pe` | Play a round in an event |
| `cd-seteventround` | `cd-ser` | Manually set a player's progress |

---

## Creating an Event

```
cd-createevent <number of rounds> <event name>
```

- Rounds: 1-30
- Creates the event as **inactive** with random cars, tunes, and tracks
- Deadline defaults to "unlimited"
- You then use `cd-editevent` to set it up properly

**Example:**
```
cd-createevent 5 Weekly Challenge
```

---

## Editing an Event

All edits use the format:
```
cd-editevent <event name> <criteria> [parameters]
```

### Basic Settings

| Edit | Syntax | Example |
|------|--------|---------|
| Rename | `name <new name>` | `cd-editevent Weekly Challenge name Spring Sprint` |
| Set duration | `duration <days>` | `cd-editevent Weekly Challenge duration 7` |
| Extend deadline | `extend <hours>` | `cd-editevent Weekly Challenge extend 12` |

- `duration` sets how many days the event runs after being started (cannot edit while active)
- `extend` adds hours to an already-active event's deadline

### Round Setup

| Edit | Syntax | Example |
|------|--------|---------|
| Set car | `setcar <round> <car name>` | `cd-editevent Weekly Challenge setcar 1 Nissan GTR` |
| Set tune | `settune <round> <tune>` | `cd-editevent Weekly Challenge settune 1 996` |
| Set track | `settrack <round> <track name>` | `cd-editevent Weekly Challenge settrack 1 Hairpin Road` |

**Valid tunes:** `000`, `333`, `666`, `699`, `969`, `996`

### Requirements

Requirements restrict what car the player can use for a round.

```
cd-editevent <event> addreq <round> <requirement> <value(s)>
cd-editevent <event> removereq <round> <requirement>
```

Uses the same filter syntax as `cd-filter`. Common requirements:

| Requirement | Example Value | Notes |
|-------------|--------------|-------|
| `make` | `BMW` | Can be a single make or array |
| `country` | `DE` | 2-letter country code |
| `driveType` | `RWD` | RWD, FWD, 4WD, AWD |
| `tyreType` | `Performance` | Standard, Performance, Slick, Off-Road, All-Surface, Drag |
| `bodyStyle` | `Coupe` | Pickup, Open Air, Sedan, Coupe, Other, Hatchback, Convertible, SUV, Wagon |
| `cr` | `200 500` | Min and max CR range |
| `modelYear` | `1990 2000` | Min and max year range |
| `tags` | `JDM` | Tag name |
| `hiddenTag` | `Concept` | Hidden tag name |
| `enginePos` | `Middle` | Front, Middle, Rear, Mixed |
| `fuelType` | `Electric` | Petrol, Diesel, Electric, Hybrid, Alternative |
| `gc` | `Low` | Low, Medium, High |
| `isPrize` | `true` | Boolean |
| `abs` | `true` | Boolean |
| `tcs` | `true` | Boolean |

**Example:**
```
cd-editevent Weekly Challenge addreq 1 make BMW
cd-editevent Weekly Challenge addreq 1 cr 200 500
cd-editevent Weekly Challenge addreq 2 tyreType Performance
cd-editevent Weekly Challenge removereq 2 tyreType
```

### Rewards

```
cd-editevent <event> addreward <round> <type> <value>
cd-editevent <event> removereward <round> <type or "all">
```

Max **3 reward types** per round.

| Type | Syntax | Example |
|------|--------|---------|
| Money | `money <amount>` | `addreward 1 money 50000` |
| Fuse Tokens | `fusetokens <amount>` | `addreward 1 fusetokens 10` |
| Trophies | `trophies <amount>` | `addreward 1 trophies 5` |
| Car | `car <car name> <tune>` | `addreward 3 car Nissan GTR 996` |
| Pack | `pack <pack name>` | `addreward 5 pack Japanese Carbon Fiber` |

**Example:**
```
cd-editevent Weekly Challenge addreward 1 money 25000
cd-editevent Weekly Challenge addreward 3 fusetokens 5
cd-editevent Weekly Challenge addreward 5 car Porsche 911 GT3 996
cd-editevent Weekly Challenge removereward 1 money
cd-editevent Weekly Challenge removereward 3 all
```

### Bulk Operations

**Regenerate all tracks:**
```
cd-editevent <event> regentracks <asphalt/dirt/snow>
```

**Regenerate all opponent cars:**
```
cd-editevent <event> regenopponents <random/filter>
```
- `random` = picks any car
- `filter` = uses your current filter settings

**Bulk edit a single round (JSON):**
```
cd-editevent <event> bulk <round> <JSON>
```

JSON format:
```json
{
  "carID": "c01273",
  "upgrade": "996",
  "track": "t00006",
  "reqs": {"make": ["BMW"], "cr": {"start": 200, "end": 500}},
  "rewards": {"money": 50000}
}
```

---

## Starting an Event

```
cd-startevent <event name>
```

- Converts the duration (e.g. 7 days) into an actual deadline from now
- Generates a graphic showing all rounds (cars, tracks, rewards, requirements)
- Posts the graphic in the current events channel
- Sends DM notifications to players who have event notifications enabled
- If the graphic fails to generate, a fallback image is posted instead

---

## Ending an Event

```
cd-endevent <event name>
```

- Asks for confirmation
- Archives the event results (participants, completions, full roster snapshot)
- Posts an ending message and creates a thread with full event details
- Deletes the event from the active events list

Events also auto-expire when their deadline passes (checked every 3 minutes by the scheduled task in index.js).

---

## Viewing Events

```
cd-events              # List all events
cd-events 2            # Page 2 of event list
cd-events Weekly       # View specific event details
cd-events Weekly 2     # Page 2 of an event's roster
```

- Active events show time remaining
- Inactive events are only visible to event makers
- Shows your progress (rounds completed / total)

---

## Manual Progress Control

```
cd-seteventround <player> <event name> <round number>
```

Manually sets which round a player is on. Useful for fixing issues or granting progress.

---

## Typical Workflow

1. `cd-createevent 5 Spring Sprint` — create with 5 rounds
2. Edit each round:
   - `cd-editevent Spring Sprint setcar 1 Honda Civic Type R`
   - `cd-editevent Spring Sprint settune 1 333`
   - `cd-editevent Spring Sprint settrack 1 City Streets`
   - `cd-editevent Spring Sprint addreq 1 tyreType Performance`
   - `cd-editevent Spring Sprint addreward 1 money 25000`
3. Repeat for rounds 2-5
4. `cd-editevent Spring Sprint duration 7` — set to 7 days
5. `cd-events Spring Sprint` — preview it
6. `cd-startevent Spring Sprint` — go live
7. `cd-endevent Spring Sprint` — end early (or let it auto-expire)
