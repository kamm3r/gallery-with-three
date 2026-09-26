// A night on Hollow Lane, Friday-the-13th style: one survivor, one killer.
//
// Escape by car (find the keys, a gas can and a battery, then start it; the
// engine is loud) or by police (find a fuse, fix the payphone, call, and
// survive until the cruiser pulls up at the south end). Parts hide in random
// search spots each night, most of them inside the houses.
//
// Everything is on E: hold it to search, press it to pick up what you find,
// to hide in a wardrobe or hedge and come back out, and to open or close a
// door. Hold it on a closed door from inside to lock it. The car and the
// payphone take a long hold.
//
// The killer walks slower than you do; he's relentless, not fast. He
// patrols, hears sprinting, rummaging and slammed doors, follows you on
// sight, opens doors in his way and breaks locked ones down, checks hiding
// places when he loses you, and now and then senses where you are. After a
// long chase he can shift: a short burst of unnatural speed. You survive one
// stab. Sprinting burns stamina.

import {
  buildNavGrid,
  doorAt,
  DOORS,
  ESCAPE_CAR,
  findPath,
  HIDE_SPOTS,
  insideHouse,
  KILLER_START,
  LAMP_GLOW,
  lineOfSight,
  PAYPHONE,
  POLICE_STOP,
  SEARCH_SPOTS,
  STREET_LAMPS,
  walkable,
  type NavGrid,
  type Point,
} from "./hollowLane.ts";

export const PARTS = ["keys", "gas", "battery", "fuse"] as const;
export type Part = (typeof PARTS)[number];
export const CAR_PARTS: Part[] = ["keys", "gas", "battery"];
/** Bonus finds: a med kit closes a wound, an energy drink refills stamina. */
export const BONUS = ["medkit", "drink"] as const;
export type Bonus = (typeof BONUS)[number];
export type Loot = Part | Bonus;
export const isPart = (loot: Loot): loot is Part => (PARTS as readonly string[]).includes(loot);

/** Each night only a few containers per house are worth searching (and glint). */
export const LIVE_PER_HOUSE = 2;
export const LIVE_OUTDOORS = 3;

export const NIGHT = {
  maxStamina: 100,
  injuredStamina: 70,
  sprintDrain: 22,
  regen: 16,
  injuredRegen: 10,
  regenDelay: 0.8,
  /** Once drained, sprinting stays locked until stamina climbs back to this. */
  recoverAt: 35,
  health: 2,
  searchReach: 1.4,
  searchTime: 2.2,
  doorReach: 1.8,
  /** Holding E this long on a closed door (from inside) locks it. */
  lockTime: 1.1,
  /** Extra reach beyond a hiding spot's own radius. */
  hideReach: 0.5,
  carReach: 3.4,
  carTime: 5,
  phoneReach: 1.8,
  phoneTime: 3,
  policeDelay: 75,
  policeReach: 5,
  sprintNoise: 16,
  searchNoise: 12,
  doorNoise: 11,
  phoneNoise: 14,
} as const;

export const KILLER = {
  /** Seconds before he starts moving. */
  wakeDelay: 20,
  patrol: 2.4,
  investigate: 3.6,
  search: 3,
  /** Slower than the survivor's 4.8 m/s walk: he wins by never stopping. */
  chase: 4.3,
  shift: 12,
  shiftTime: 1,
  shiftCooldown: 30,
  shiftGap: 15,
  /** Only after chasing this long does he shift at all. */
  shiftAfter: 6,
  /** How far he sees you in the dark, and standing in lamplight. */
  sight: 18,
  litSight: 30,
  /** A lit flashlight carries in the dark: switch it off to sneak. */
  torchSight: 22,
  /** Cosine of his half field of view. */
  fov: 0.35,
  /** Always notices you this close, whatever way he faces. */
  feel: 3.5,
  loseAfter: 3,
  attackRange: 1.7,
  hitRange: 2.3,
  windup: 0.55,
  /** Dragged out of hiding you get a moment to bolt before the knife comes down. */
  pulledOutWindup: 0.9,
  missRecover: 1.5,
  hitRecover: 3.5,
  dwell: 1.2,
  openDoor: 0.6,
  /** Seconds of bashing to break a locked door; a bang every `bashEvery`. */
  breakDoor: 4.5,
  bashEvery: 1.5,
  /** Hiding places within this radius of where he lost you are worth checking. */
  searchRadius: 12,
  searchHides: 2,
  /** Chance each nearby hiding place makes his list at all. */
  checkChance: 0.7,
  senseInterval: 75,
  senseStep: 6,
  senseMin: 45,
  /** A sense points him near you, not at you: this far off, give or take. */
  senseFuzz: [6, 14] as const,
  /** Chance a patrol leg wanders into the survivor's part of the street. */
  drift: 0.3,
  /** "Your part of the street": places within this radius of you. */
  driftRadius: 30,
} as const;

export type KillerMode =
  | "dormant"
  | "patrol"
  | "investigate"
  | "chase"
  | "attack"
  | "recover"
  | "search";

export interface Killer extends Point {
  yaw: number;
  mode: KillerMode;
  path: Point[];
  goal: Point | null;
  repath: number;
  timer: number;
  lastSeen: Point;
  lostFor: number;
  chasing: number;
  queue: { point: Point; hide: number }[];
  shiftCooldown: number;
  shifting: number;
  sense: number;
  /** Hiding place he watched you get into, or -1. */
  sawHide: number;
  moving: boolean;
  /** Door he's opening or breaking, or -1. */
  door: number;
  doorTimer: number;
  bash: number;
}

export interface DoorState {
  open: boolean;
  locked: boolean;
  broken: boolean;
}

/** What E would do right now. */
export type FocusKind = "search" | "pickup" | "hide" | "unhide" | "door" | "car" | "phone";
export interface Focus {
  kind: FocusKind;
  index: number;
}

export interface Survivor extends Point {
  stamina: number;
  exhausted: boolean;
  regenWait: number;
  health: number;
  hide: number;
  hidden: boolean;
  focus: Focus | null;
  /** Seconds E has been held on the current focus. */
  hold: number;
  /** A press on a closed door waits for release (open) or a long hold (lock). */
  doorPress: boolean;
  flashlight: boolean;
}

export type Outcome = "car" | "police" | "dead";

export interface Night {
  grid: NavGrid;
  random: () => number;
  /** Search spot holding each part. */
  stash: Record<Part, number>;
  /** What each search spot holds tonight (null: nothing). */
  loot: (Loot | null)[];
  /** Search spots that are in play tonight; the rest are empty and dark. */
  live: boolean[];
  found: Record<Part, boolean>;
  searched: boolean[];
  /** Loot lying in a searched spot, waiting to be picked up. */
  revealed: (Loot | null)[];
  doors: DoorState[];
  survivor: Survivor;
  killer: Killer;
  police: number;
  policeHere: boolean;
  outcome: Outcome | null;
  noiseTimer: number;
  /** A noise just drew him over (reported once as a "heard" event). */
  heard: boolean;
}

export type NightEvent =
  | { type: "search"; index: number }
  | { type: "revealed"; item: Loot; index: number }
  | { type: "found"; item: Loot }
  | { type: "healed"; health: number }
  | { type: "empty"; index: number }
  | { type: "hidden"; index: number }
  | { type: "unhidden" }
  | { type: "door"; index: number; open: boolean; by: "survivor" | "killer" }
  | { type: "locked"; index: number; locked: boolean }
  | { type: "bash"; index: number }
  | { type: "broken"; index: number }
  | { type: "exhausted" }
  | { type: "awake" }
  | { type: "spotted" }
  | { type: "lost" }
  | { type: "sense" }
  | { type: "heard" }
  | { type: "shift" }
  | { type: "windup" }
  | { type: "pulledOut" }
  | { type: "hit"; health: number }
  | { type: "miss" }
  | { type: "carStart" }
  | { type: "called" }
  | { type: "policeHere" }
  | { type: "escaped"; outcome: Outcome };

export interface SurvivorInput extends Point {
  moving: boolean;
  /** Holding sprint while moving. */
  sprinting: boolean;
  /** E is held. */
  interact: boolean;
  /** E went down this frame. */
  press: boolean;
  /** Flashlight switched on (makes you visible from further off). */
  flashlight?: boolean;
}

let sharedGrid: NavGrid | null = null;

export function createNight(random: () => number = Math.random): Night {
  sharedGrid ??= buildNavGrid();
  const shuffle = <T>(list: T[]) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  // Tonight's live containers: a couple per house, a few outdoors.
  const live = SEARCH_SPOTS.map(() => false);
  const groups = new Map<number, number[]>();
  SEARCH_SPOTS.forEach((spot, i) => groups.set(spot.house, [...(groups.get(spot.house) ?? []), i]));
  for (const [house, indices] of groups)
    for (const i of shuffle([...indices]).slice(0, house < 0 ? LIVE_OUTDOORS : LIVE_PER_HOUSE))
      live[i] = true;
  // Then the loot, shuffled among them.
  const spots = shuffle(SEARCH_SPOTS.map((_, i) => i).filter((i) => live[i]));
  const loot: (Loot | null)[] = SEARCH_SPOTS.map(() => null);
  [...PARTS, ...BONUS].forEach((item, n) => (loot[spots[n]] = item));
  const stash = Object.fromEntries(PARTS.map((part, i) => [part, spots[i]])) as Record<
    Part,
    number
  >;
  return {
    grid: sharedGrid,
    random,
    stash,
    loot,
    live,
    found: { keys: false, gas: false, battery: false, fuse: false },
    searched: SEARCH_SPOTS.map(() => false),
    revealed: SEARCH_SPOTS.map(() => null),
    doors: DOORS.map(() => ({ open: false, locked: false, broken: false })),
    survivor: {
      x: 0,
      z: 0,
      stamina: NIGHT.maxStamina,
      exhausted: false,
      regenWait: 0,
      health: NIGHT.health,
      hide: -1,
      hidden: false,
      focus: null,
      hold: 0,
      doorPress: false,
      flashlight: false,
    },
    killer: {
      ...KILLER_START,
      yaw: 0,
      mode: "dormant",
      path: [],
      goal: null,
      repath: 0,
      timer: KILLER.wakeDelay,
      lastSeen: { ...KILLER_START },
      lostFor: 0,
      chasing: 0,
      queue: [],
      shiftCooldown: 0,
      shifting: 0,
      sense: KILLER.senseInterval,
      sawHide: -1,
      moving: false,
      door: -1,
      doorTimer: 0,
      bash: 0,
    },
    police: -1,
    policeHere: false,
    outcome: null,
    noiseTimer: 0,
    heard: false,
  };
}

export function partsFound(night: Night) {
  return PARTS.filter((part) => night.found[part]).length;
}

export function canStartCar(night: Night) {
  return CAR_PARTS.every((part) => night.found[part]);
}

export function sprintAllowed(night: Night) {
  return !night.survivor.exhausted && night.survivor.stamina > 0;
}

export function maxStamina(night: Night) {
  return night.survivor.health < NIGHT.health ? NIGHT.injuredStamina : NIGHT.maxStamina;
}

/** Seconds E must be held for a focus (0: a press does it). */
export function holdTime(night: Night, focus: Focus) {
  if (focus.kind === "search") return NIGHT.searchTime;
  if (focus.kind === "car") return NIGHT.carTime;
  if (focus.kind === "phone") return NIGHT.phoneTime;
  // A held door press only means something (locking) from inside.
  if (
    focus.kind === "door" &&
    night.survivor.doorPress &&
    insideHouse(night.survivor) === DOORS[focus.index].house
  )
    return NIGHT.lockTime;
  return 0;
}

/** What the killer is up to, as the survivor would feel it. */
export function awareness(night: Night): "asleep" | "unaware" | "suspicious" | "hunting" {
  const mode = night.killer.mode;
  if (mode === "dormant") return "asleep";
  if (mode === "patrol") return "unaware";
  if (mode === "investigate" || mode === "search") return "suspicious";
  return "hunting";
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);

function setGoal(killer: Killer, night: Night, goal: Point) {
  killer.goal = { x: goal.x, z: goal.z };
  killer.path = findPath(night.grid, killer, goal);
  killer.repath = 0.6;
}

const PATROL_PLACES: Point[] = [...SEARCH_SPOTS, ...STREET_LAMPS, ESCAPE_CAR, PAYPHONE];

function patrolGoal(night: Night): Point {
  const { random, survivor } = night;
  // Now and then he wanders into your part of the street: some real place
  // near you (a house, a lamp), never your exact position. He doesn't know
  // where you are unless he sees, hears or senses you.
  if (random() < KILLER.drift) {
    const near = PATROL_PLACES.filter((p) => distance(p, survivor) < KILLER.driftRadius);
    if (near.length) return near[Math.floor(random() * near.length)];
  }
  return PATROL_PLACES[Math.floor(random() * PATROL_PLACES.length)];
}

function beginSearch(night: Night, around: Point) {
  const killer = night.killer;
  // He doesn't know where you hid: he tears open a couple of nearby wardrobes
  // and hedges at random. Only a place he watched you get into is certain.
  const nearby = HIDE_SPOTS.map((spot, hide) => ({ point: spot as Point, hide })).filter(
    ({ point, hide }) => distance(point, around) < KILLER.searchRadius && hide !== killer.sawHide,
  );
  for (let i = nearby.length - 1; i > 0; i--) {
    const j = Math.floor(night.random() * (i + 1));
    [nearby[i], nearby[j]] = [nearby[j], nearby[i]];
  }
  const checks = nearby
    .filter(() => night.random() < KILLER.checkChance)
    .slice(0, KILLER.searchHides);
  if (killer.sawHide >= 0)
    checks.unshift({ point: HIDE_SPOTS[killer.sawHide], hide: killer.sawHide });
  killer.queue = [{ point: around, hide: -1 }, ...checks];
  killer.mode = "search";
  killer.timer = 0;
  setGoal(killer, night, killer.queue[0].point);
}

/** Walk the current path, stopping at closed doors. Returns true when done. */
function walk(killer: Killer, night: Night, speed: number, dt: number) {
  let budget = speed * dt;
  killer.moving = false;
  while (budget > 0 && killer.path.length) {
    const next = killer.path[0];
    const dx = next.x - killer.x,
      dz = next.z - killer.z;
    const gap = Math.hypot(dx, dz);
    if (gap < 1e-3) {
      killer.path.shift();
      continue;
    }
    const door = doorAt(night.grid, killer.x + (dx / gap) * 0.6, killer.z + (dz / gap) * 0.6);
    if (door >= 0 && !night.doors[door].open) {
      const state = night.doors[door];
      killer.door = door;
      killer.doorTimer = state.locked ? KILLER.breakDoor : KILLER.openDoor;
      killer.bash = 0;
      killer.yaw = Math.atan2(dx, dz);
      return false;
    }
    const step = Math.min(gap, budget);
    killer.x += (dx / gap) * step;
    killer.z += (dz / gap) * step;
    killer.yaw = Math.atan2(dx, dz);
    killer.moving = true;
    budget -= step;
    if (step >= gap) killer.path.shift();
  }
  // Out of path means arrived, or as close as he can get (a goal inside a
  // wardrobe or behind furniture): either way, time for the next thing.
  return killer.path.length === 0;
}

/** Standing in a streetlamp's pool makes you visible from much further. */
export function inLamplight(p: Point) {
  return STREET_LAMPS.some((lamp) => distance(lamp, p) < LAMP_GLOW);
}

function canSee(night: Night) {
  const { killer, survivor } = night;
  if (survivor.hidden) return false;
  const gap = distance(killer, survivor);
  const sight = inLamplight(survivor)
    ? KILLER.litSight
    : survivor.flashlight
      ? KILLER.torchSight
      : KILLER.sight;
  if (gap > sight) return false;
  if (gap > KILLER.feel) {
    const facing =
      ((survivor.x - killer.x) * Math.sin(killer.yaw) +
        (survivor.z - killer.z) * Math.cos(killer.yaw)) /
      gap;
    if (facing < KILLER.fov) return false;
  }
  return lineOfSight(night.grid, killer, survivor, (door) => !night.doors[door].open);
}

/** The nearest thing E would act on, or null. */
export function findFocus(night: Night, at: Point): Focus | null {
  const s = night.survivor;
  if (s.hidden) return { kind: "unhide", index: s.hide };
  let best: Focus | null = null,
    bestDistance = Infinity;
  const consider = (kind: FocusKind, index: number, where: Point, reach: number) => {
    const d = distance(where, at);
    if (d < reach && d < bestDistance) {
      best = { kind, index };
      bestDistance = d;
    }
  };
  SEARCH_SPOTS.forEach((spot, i) => {
    // A find sits where you dug it up; pick-ups win ties with searching.
    if (night.revealed[i]) consider("pickup", i, spot, NIGHT.searchReach + 0.3);
    else if (night.live[i] && !night.searched[i]) consider("search", i, spot, NIGHT.searchReach);
  });
  HIDE_SPOTS.forEach((spot, i) => consider("hide", i, spot, spot.r + NIGHT.hideReach));
  DOORS.forEach((door, i) => {
    if (!night.doors[i].broken) consider("door", i, door, NIGHT.doorReach);
  });
  if (canStartCar(night)) consider("car", 0, ESCAPE_CAR, NIGHT.carReach);
  if (night.found.fuse && night.police < 0 && !night.policeHere)
    consider("phone", 0, PAYPHONE, NIGHT.phoneReach);
  return best;
}

function setDoor(night: Night, index: number, open: boolean, events: NightEvent[]) {
  night.doors[index].open = open;
  events.push({ type: "door", index, open, by: "survivor" });
  hear(night, DOORS[index], NIGHT.doorNoise);
}

function stepSurvivor(night: Night, input: SurvivorInput, dt: number, events: NightEvent[]) {
  const s = night.survivor;
  s.x = input.x;
  s.z = input.z;
  s.flashlight = Boolean(input.flashlight);
  const top = maxStamina(night);
  const sprinting = input.sprinting && input.moving && sprintAllowed(night);
  if (sprinting) {
    s.stamina = Math.max(0, s.stamina - NIGHT.sprintDrain * dt);
    s.regenWait = NIGHT.regenDelay;
    if (s.stamina === 0) {
      s.exhausted = true;
      events.push({ type: "exhausted" });
    }
  } else if (s.regenWait > 0) s.regenWait -= dt;
  else {
    const rate = s.health < NIGHT.health ? NIGHT.injuredRegen : NIGHT.regen;
    s.stamina = Math.min(top, s.stamina + rate * dt);
    if (s.exhausted && s.stamina >= NIGHT.recoverAt) s.exhausted = false;
  }

  // Walking off (or out of reach) always leaves a hiding place.
  if (s.hidden && (input.moving || distance(HIDE_SPOTS[s.hide], s) > HIDE_SPOTS[s.hide].r + 0.8)) {
    s.hidden = false;
    events.push({ type: "unhidden" });
  }

  const focus = findFocus(night, s);
  const same = focus && s.focus && focus.kind === s.focus.kind && focus.index === s.focus.index;
  if (!same) {
    s.hold = 0;
    s.doorPress = false;
  }
  s.focus = focus;
  if (!focus) return;

  if (input.press) {
    switch (focus.kind) {
      case "unhide":
        s.hidden = false;
        events.push({ type: "unhidden" });
        s.focus = null;
        return;
      case "hide":
        s.hidden = true;
        s.hide = focus.index;
        // He watched you get in: that's the first place he'll look.
        if (night.killer.mode === "chase" && night.killer.lostFor === 0)
          night.killer.sawHide = focus.index;
        events.push({ type: "hidden", index: focus.index });
        return;
      case "pickup": {
        const item = night.revealed[focus.index]!;
        night.revealed[focus.index] = null;
        events.push({ type: "found", item });
        if (isPart(item)) {
          night.found[item] = true;
          // Every part found makes him sense you sooner.
          night.killer.sense = Math.min(night.killer.sense, senseInterval(night));
        }
        return;
      }
      case "door": {
        const door = night.doors[focus.index];
        const inside = insideHouse(s) === DOORS[focus.index].house;
        if (door.locked) {
          if (inside) {
            door.locked = false;
            events.push({ type: "locked", index: focus.index, locked: false });
          }
        } else if (door.open) setDoor(night, focus.index, false, events);
        else {
          // Opens on release; held long enough from inside, it locks instead.
          s.doorPress = true;
          s.hold = 0;
        }
        return;
      }
    }
  }

  if (focus.kind === "door" && s.doorPress) {
    const inside = insideHouse(s) === DOORS[focus.index].house;
    if (!input.interact) {
      s.doorPress = false;
      setDoor(night, focus.index, true, events);
    } else if (inside) {
      s.hold += dt;
      if (s.hold >= NIGHT.lockTime) {
        s.doorPress = false;
        s.hold = 0;
        night.doors[focus.index].locked = true;
        events.push({ type: "locked", index: focus.index, locked: true });
        hear(night, DOORS[focus.index], NIGHT.doorNoise);
      }
    }
    return;
  }

  const needed = holdTime(night, focus);
  if (!needed) return;
  // Long jobs need E held and your feet planted; let go and you start over.
  if (!input.interact || input.moving) {
    s.hold = 0;
    return;
  }
  if (s.hold === 0) {
    if (focus.kind === "search") events.push({ type: "search", index: focus.index });
    if (focus.kind === "car") {
      events.push({ type: "carStart" });
      hear(night, ESCAPE_CAR, Infinity);
    }
  }
  s.hold += dt;
  night.noiseTimer -= dt;
  if (night.noiseTimer <= 0) {
    night.noiseTimer = 1;
    if (focus.kind === "search") hear(night, s, NIGHT.searchNoise);
    if (focus.kind === "phone") hear(night, s, NIGHT.phoneNoise);
    if (focus.kind === "car") hear(night, ESCAPE_CAR, Infinity);
  }
  if (s.hold < needed) return;
  s.hold = 0;
  if (focus.kind === "search") {
    night.searched[focus.index] = true;
    const item = night.loot[focus.index];
    if (item) {
      night.revealed[focus.index] = item;
      events.push({ type: "revealed", item, index: focus.index });
    } else events.push({ type: "empty", index: focus.index });
  } else if (focus.kind === "car") {
    night.outcome = "car";
    events.push({ type: "escaped", outcome: "car" });
  } else if (focus.kind === "phone") {
    night.police = NIGHT.policeDelay;
    events.push({ type: "called" });
  }
}

/**
 * Use a bonus item from the inventory. Returns whether it did anything (a
 * med kit does nothing at full health, and stays in your pocket).
 */
export function applyBonus(night: Night, item: Bonus): NightEvent[] {
  const s = night.survivor;
  if (night.outcome) return [];
  if (item === "medkit") {
    if (s.health >= NIGHT.health) return [];
    s.health++;
    return [{ type: "healed", health: s.health }];
  }
  s.stamina = maxStamina(night);
  s.exhausted = false;
  return [{ type: "healed", health: s.health }];
}

function senseInterval(night: Night) {
  return Math.max(KILLER.senseMin, KILLER.senseInterval - partsFound(night) * KILLER.senseStep);
}

/** A noise at `at`: he comes to look if he's within `radius`. */
function hear(night: Night, at: Point, radius: number) {
  const killer = night.killer;
  if (!["patrol", "investigate", "search"].includes(killer.mode)) return;
  if (distance(killer, at) > radius) return;
  // Only a fresh alert is news to the survivor (not every repeat rustle).
  if (killer.mode !== "investigate") night.heard = true;
  killer.mode = "investigate";
  setGoal(killer, night, at);
}

function stepKiller(night: Night, input: SurvivorInput, dt: number, events: NightEvent[]) {
  const k = night.killer;
  const s = night.survivor;
  k.shiftCooldown = Math.max(0, k.shiftCooldown - dt);
  k.shifting = Math.max(0, k.shifting - dt);
  k.moving = false;
  if (k.mode === "dormant") {
    k.timer -= dt;
    if (k.timer > 0) return;
    k.mode = "patrol";
    setGoal(k, night, patrolGoal(night));
    events.push({ type: "awake" });
  }

  k.sense -= dt;
  if (k.sense <= 0) {
    k.sense = senseInterval(night);
    if (!s.hidden && k.mode !== "chase" && k.mode !== "attack") {
      events.push({ type: "sense" });
      // He feels roughly where you are: he heads for somewhere near you.
      const [near, far] = KILLER.senseFuzz;
      const angle = night.random() * Math.PI * 2,
        off = near + night.random() * (far - near);
      const guess = { x: s.x + Math.cos(angle) * off, z: s.z + Math.sin(angle) * off };
      k.mode = "investigate";
      setGoal(k, night, walkable(night.grid, guess.x, guess.z) ? guess : s);
    }
  }
  if (input.sprinting && input.moving && sprintAllowed(night)) hear(night, s, NIGHT.sprintNoise);

  const sees = canSee(night);
  if (sees) {
    k.lastSeen = { x: s.x, z: s.z };
    k.lostFor = 0;
    if (k.mode === "patrol" || k.mode === "investigate" || k.mode === "search") {
      k.mode = "chase";
      k.chasing = 0;
      k.sawHide = -1;
      events.push({ type: "spotted" });
    }
  }
  const gap = distance(k, s);

  // A door in his way: a beat to open it, or a long bashing if it's locked.
  if (k.door >= 0) {
    const door = night.doors[k.door];
    if (door.open) k.door = -1;
    else {
      k.doorTimer -= dt;
      if (door.locked) {
        k.bash -= dt;
        if (k.bash <= 0) {
          k.bash = KILLER.bashEvery;
          events.push({ type: "bash", index: k.door });
        }
      }
      if (k.doorTimer > 0) return;
      door.open = true;
      if (door.locked) {
        door.locked = false;
        door.broken = true;
        events.push({ type: "broken", index: k.door });
      } else events.push({ type: "door", index: k.door, open: true, by: "killer" });
      k.door = -1;
    }
  }

  switch (k.mode) {
    case "patrol":
      if (walk(k, night, KILLER.patrol, dt)) setGoal(k, night, patrolGoal(night));
      break;
    case "investigate":
      if (walk(k, night, KILLER.investigate, dt)) beginSearch(night, k);
      break;
    case "search": {
      const current = k.queue[0];
      if (!current) {
        k.mode = "patrol";
        k.sawHide = -1;
        setGoal(k, night, patrolGoal(night));
        break;
      }
      if (!walk(k, night, KILLER.search, dt)) break;
      k.timer += dt;
      if (current.hide >= 0 && s.hidden && s.hide === current.hide) {
        // Found you. Drag you out and strike.
        s.hidden = false;
        k.sawHide = -1;
        k.mode = "attack";
        k.timer = KILLER.pulledOutWindup;
        events.push({ type: "pulledOut" }, { type: "windup" });
        break;
      }
      if (k.timer >= KILLER.dwell) {
        k.queue.shift();
        k.timer = 0;
        if (k.queue[0]) setGoal(k, night, k.queue[0].point);
      }
      break;
    }
    case "chase": {
      k.chasing += dt;
      if (!sees) {
        k.lostFor += dt;
        if (k.lostFor > KILLER.loseAfter) {
          events.push({ type: "lost" });
          beginSearch(night, k.lastSeen);
          break;
        }
      }
      if (sees && gap > KILLER.shiftGap && k.shiftCooldown <= 0 && k.chasing > KILLER.shiftAfter) {
        k.shifting = KILLER.shiftTime;
        k.shiftCooldown = KILLER.shiftCooldown;
        events.push({ type: "shift" });
      }
      k.repath -= dt;
      const target = sees ? s : k.lastSeen;
      if (k.repath <= 0 || !k.goal || distance(k.goal, target) > 2) setGoal(k, night, target);
      walk(k, night, k.shifting > 0 ? KILLER.shift : KILLER.chase, dt);
      if (sees && gap < KILLER.attackRange) {
        k.mode = "attack";
        k.timer = KILLER.windup;
        events.push({ type: "windup" });
      }
      break;
    }
    case "attack": {
      k.yaw = Math.atan2(s.x - k.x, s.z - k.z);
      k.timer -= dt;
      if (k.timer > 0) break;
      if (gap < KILLER.hitRange && !s.hidden) {
        s.health--;
        s.stamina = maxStamina(night);
        s.exhausted = false;
        events.push({ type: "hit", health: s.health });
        if (s.health <= 0) {
          night.outcome = "dead";
          events.push({ type: "escaped", outcome: "dead" });
          break;
        }
        k.mode = "recover";
        k.timer = KILLER.hitRecover;
      } else {
        events.push({ type: "miss" });
        k.mode = "recover";
        k.timer = KILLER.missRecover;
      }
      break;
    }
    case "recover":
      k.timer -= dt;
      if (k.timer <= 0) {
        if (sees) k.mode = "chase";
        else beginSearch(night, k.lastSeen);
      }
      break;
  }
}

export function stepNight(night: Night, dt: number, input: SurvivorInput): NightEvent[] {
  const events: NightEvent[] = [];
  if (night.outcome) return events;
  stepSurvivor(night, input, dt, events);
  if (night.outcome) return events;
  if (night.police > 0) {
    night.police = Math.max(0, night.police - dt);
    if (night.police === 0) {
      night.policeHere = true;
      events.push({ type: "policeHere" });
    }
  }
  if (night.policeHere && distance(night.survivor, POLICE_STOP) < NIGHT.policeReach) {
    night.outcome = "police";
    events.push({ type: "escaped", outcome: "police" });
    return events;
  }
  stepKiller(night, input, dt, events);
  if (night.heard) {
    night.heard = false;
    if (!night.outcome) events.push({ type: "heard" });
  }
  return events;
}
