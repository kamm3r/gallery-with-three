import test from "node:test";
import assert from "node:assert/strict";
import {
  CAR_PARTS,
  canStartCar,
  createNight,
  applyBonus,
  findFocus,
  KILLER,
  LIVE_PER_HOUSE,
  NIGHT,
  PARTS,
  sprintAllowed,
  stepNight,
  type Night,
  type NightEvent,
} from "../src/gameplay/hollowNight.ts";
import {
  buildNavGrid,
  doorAt,
  DOORS,
  ESCAPE_CAR,
  findPath,
  HIDE_SPOTS,
  HOUSES,
  houseToWorld,
  LANE_START,
  lineOfSight,
  PAYPHONE,
  POLICE_STOP,
  SEARCH_SPOTS,
  walkable,
  type Point,
} from "../src/gameplay/hollowLane.ts";

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => (value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296;
}

const d = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const idle = { moving: false, sprinting: false, interact: false, press: false };

/** Stand at a point for `seconds`, E up. */
function wait(night: Night, at: Point, seconds: number) {
  const events: NightEvent[] = [];
  for (let t = 0; t < seconds; t += 0.05)
    events.push(...stepNight(night, 0.05, { ...at, ...idle }));
  return events;
}
/** Hold E at a point for `seconds` (the first frame is the press). */
function holdE(night: Night, at: Point, seconds: number) {
  const events: NightEvent[] = [];
  for (let t = 0; t < seconds; t += 0.05)
    events.push(...stepNight(night, 0.05, { ...at, ...idle, interact: true, press: t === 0 }));
  return events;
}
/** Tap E: press on one frame, release on the next. */
function tapE(night: Night, at: Point) {
  return [
    ...stepNight(night, 0.05, { ...at, ...idle, interact: true, press: true }),
    ...stepNight(night, 0.05, { ...at, ...idle }),
  ];
}
function asleep(night: Night) {
  night.killer.timer = Infinity;
  return night;
}

test("every search spot, hiding place, doorway and exit can be walked to from the gate", () => {
  const grid = buildNavGrid();
  const start = { x: LANE_START[0], z: LANE_START[2] };
  for (const p of [...SEARCH_SPOTS, ...HIDE_SPOTS, ...DOORS, POLICE_STOP]) {
    assert.ok(walkable(grid, p.x, p.z), `blocked at ${p.x},${p.z}`);
    assert.ok(findPath(grid, start, p).length > 0, `no path to ${p.x},${p.z}`);
  }
  for (const p of [ESCAPE_CAR, PAYPHONE]) assert.ok(findPath(grid, start, p).length > 0);
  for (const door of DOORS) assert.ok(doorAt(grid, door.x, door.z) >= 0);
});

test("each night hides the four parts in four different live spots", () => {
  const night = createNight(seeded(3));
  const spots = PARTS.map((part) => night.stash[part]);
  assert.equal(new Set(spots).size, PARTS.length);
  for (const spot of spots) assert.ok(night.live[spot]);
});

test("only a couple of containers per house are live, and they change night to night", () => {
  const a = createNight(seeded(21)),
    b = createNight(seeded(22));
  HOUSES.forEach((_, house) => {
    const live = SEARCH_SPOTS.filter((spot, i) => spot.house === house && a.live[i]).length;
    assert.equal(live, LIVE_PER_HOUSE);
  });
  assert.notDeepEqual(a.live, b.live);
  // Dead containers can't be searched at all.
  const dead = SEARCH_SPOTS.findIndex((_, i) => !a.live[i]);
  assert.notEqual(findFocus(a, SEARCH_SPOTS[dead])?.kind, "search");
});

test("a med kit heals a wound (and is wasted on nobody); a drink refills stamina", () => {
  const night = createNight(seeded(23));
  assert.deepEqual(applyBonus(night, "medkit"), []);
  night.survivor.health = 1;
  assert.deepEqual(applyBonus(night, "medkit"), [{ type: "healed", health: NIGHT.health }]);
  night.survivor.stamina = 0;
  night.survivor.exhausted = true;
  assert.ok(applyBonus(night, "drink").length > 0);
  assert.equal(sprintAllowed(night), true);
});

test("searching is a held E; letting go starts it over", () => {
  const night = asleep(createNight(seeded(4)));
  const spot = SEARCH_SPOTS[night.stash.keys];
  assert.equal(findFocus(night, spot)?.kind, "search");
  holdE(night, spot, NIGHT.searchTime / 2);
  wait(night, spot, 0.1);
  assert.equal(night.searched[night.stash.keys], false);
  const events = holdE(night, spot, NIGHT.searchTime + 0.1);
  assert.ok(events.some((e) => e.type === "revealed" && e.item === "keys"));
  assert.equal(night.found.keys, false, "found parts must still be picked up");
});

test("a revealed part is picked up with a press of E", () => {
  const night = asleep(createNight(seeded(5)));
  const spot = SEARCH_SPOTS[night.stash.fuse];
  holdE(night, spot, NIGHT.searchTime + 0.1);
  wait(night, spot, 0.1);
  assert.equal(findFocus(night, spot)?.kind, "pickup");
  const events = tapE(night, spot);
  assert.ok(events.some((e) => e.type === "found" && e.item === "fuse"));
  assert.equal(night.found.fuse, true);
});

test("E opens and closes doors; held from inside, it locks them", () => {
  const night = asleep(createNight(seeded(6)));
  const house = HOUSES[0];
  const outside = houseToWorld(house, -0.2, house.hd + 1);
  const inside = houseToWorld(house, -0.2, house.hd - 1);
  const door = DOORS.findIndex((dr) => dr.house === 0 && !dr.back);
  assert.equal(findFocus(night, outside)?.kind, "door");
  tapE(night, outside);
  assert.equal(night.doors[door].open, true);
  tapE(night, outside);
  assert.equal(night.doors[door].open, false);
  // Holding from outside never locks; it opens on release.
  holdE(night, outside, NIGHT.lockTime + 0.2);
  wait(night, outside, 0.05);
  assert.equal(night.doors[door].locked, false);
  tapE(night, outside);
  const events = holdE(night, inside, NIGHT.lockTime + 0.2);
  assert.ok(events.some((e) => e.type === "locked" && e.locked));
  assert.equal(night.doors[door].open, false);
});

test("he opens a closed door in his way, and breaks down a locked one", () => {
  for (const locked of [false, true]) {
    const night = createNight(seeded(7));
    const house = HOUSES[0];
    const door = DOORS.findIndex((dr) => dr.house === 0 && !dr.back);
    night.doors[door].locked = locked;
    const inside = houseToWorld(house, 2.8, 1.2);
    const outside = houseToWorld(house, -0.2, house.hd + 6);
    Object.assign(night.killer, { mode: "investigate", ...outside, path: [], timer: 0 });
    night.killer.goal = inside;
    night.killer.path = findPath(night.grid, outside, inside);
    const events = wait(night, { x: 60, z: 60 }, 10);
    if (locked) {
      assert.ok(events.filter((e) => e.type === "bash").length >= 2);
      assert.ok(events.some((e) => e.type === "broken"));
    } else assert.ok(events.some((e) => e.type === "door" && e.by === "killer"));
    assert.equal(night.doors[door].open, true);
  }
});

test("a closed door blocks his view", () => {
  const night = createNight(seeded(8));
  const house = HOUSES[0];
  const door = DOORS.findIndex((dr) => dr.house === 0 && !dr.back);
  const outside = houseToWorld(house, -0.2, house.hd + 5);
  const inside = houseToWorld(house, -0.2, house.hd - 1.5);
  const closed = (i: number) => !night.doors[i].open;
  assert.equal(lineOfSight(night.grid, outside, inside, closed), false);
  night.doors[door].open = true;
  assert.equal(lineOfSight(night.grid, outside, inside, closed), true);
});

test("E hides you in a wardrobe; walking off comes back out", () => {
  const night = asleep(createNight(seeded(9)));
  const wardrobe = HIDE_SPOTS.find((h) => h.kind === "wardrobe")!;
  assert.equal(findFocus(night, wardrobe)?.kind, "hide");
  tapE(night, wardrobe);
  assert.equal(night.survivor.hidden, true);
  assert.equal(findFocus(night, wardrobe)?.kind, "unhide");
  stepNight(night, 0.05, { ...wardrobe, ...idle, moving: true });
  assert.equal(night.survivor.hidden, false);
});

test("sprinting burns stamina and locks out until it recovers", () => {
  const night = createNight(seeded(10));
  const at = { x: 0, z: 60 };
  for (let t = 0; t < 6; t += 0.05)
    stepNight(night, 0.05, { ...at, ...idle, moving: true, sprinting: true });
  assert.equal(sprintAllowed(night), false);
  wait(night, at, 0.5);
  assert.equal(sprintAllowed(night), false);
  wait(night, at, 2);
  assert.equal(sprintAllowed(night), true);
});

test("the car needs keys, gas and battery; holding E to start it is loud", () => {
  const night = createNight(seeded(11));
  const byCar = { x: ESCAPE_CAR.x - 2.5, z: ESCAPE_CAR.z };
  assert.notEqual(findFocus(night, byCar)?.kind, "car");
  for (const part of CAR_PARTS) night.found[part] = true;
  assert.ok(canStartCar(night));
  Object.assign(night.killer, { mode: "patrol", x: 60, z: 60 });
  const events = holdE(night, byCar, 0.2);
  assert.ok(events.some((e) => e.type === "carStart"));
  assert.equal(night.killer.mode, "investigate");
});

test("a fixed payphone brings the police, who take you out at the south end", () => {
  const night = asleep(createNight(seeded(12)));
  night.found.fuse = true;
  const events = holdE(night, { x: PAYPHONE.x + 1.2, z: PAYPHONE.z }, NIGHT.phoneTime + 0.1);
  assert.ok(events.some((e) => e.type === "called"));
  assert.ok(wait(night, POLICE_STOP, NIGHT.policeDelay + 0.2).some((e) => e.type === "escaped"));
  assert.equal(night.outcome, "police");
});

test("he stays dormant for a while, then wakes", () => {
  const night = createNight(seeded(13));
  const at = { x: 0, z: 60 };
  assert.equal(
    wait(night, at, KILLER.wakeDelay - 1).some((e) => e.type === "awake"),
    false,
  );
  assert.ok(wait(night, at, 2).some((e) => e.type === "awake"));
});

test("he walks slower than you: a walking survivor pulls away", () => {
  assert.ok(KILLER.chase < 4.8);
});

test("a lit flashlight gives you away from further off in the dark", () => {
  // Find a dark spot (away from streetlamps) he can see down a clear street.
  for (const lit of [false, true]) {
    const night = createNight(seeded(17));
    Object.assign(night.killer, { mode: "patrol", x: 0, z: 36, yaw: 0, path: [] });
    const at = { x: 0, z: 36 + KILLER.sight + 4 };
    const events = stepNight(night, 0.05, { ...at, ...idle, flashlight: lit });
    assert.equal(
      events.some((e) => e.type === "spotted"),
      lit,
    );
  }
});

test("unseen and unheard, he never heads for your exact position", () => {
  const night = createNight(seeded(31));
  const me = { x: 0, z: 40 };
  wait(night, { x: 60, z: 60 }, KILLER.wakeDelay + 0.1);
  for (let leg = 0; leg < 200; leg++) {
    Object.assign(night.killer, { mode: "patrol", path: [], x: -90, z: -90, sense: 1e9 });
    night.killer.goal = null;
    stepNight(night, 0.05, { ...me, ...idle });
    const goal = night.killer.goal!;
    assert.ok(Math.hypot(goal.x - me.x, goal.z - me.z) > 3, "patrol goal on top of the survivor");
  }
});

test("a sense points him near you, not at you", () => {
  for (let seed = 40; seed < 60; seed++) {
    const night = createNight(seeded(seed));
    Object.assign(night.killer, { mode: "patrol", x: -90, z: -90, path: [], sense: 0.01 });
    const me = { x: 0, z: 40 };
    const events = stepNight(night, 0.05, { ...me, ...idle });
    assert.ok(events.some((e) => e.type === "sense"));
    const gap = Math.hypot(night.killer.goal!.x - me.x, night.killer.goal!.z - me.z);
    assert.ok(
      gap >= KILLER.senseFuzz[0] - 0.01 && gap <= KILLER.senseFuzz[1] + 0.01,
      `goal ${gap} m off`,
    );
  }
});

test("when a noise draws him over, you're told he heard it", () => {
  const night = createNight(seeded(61));
  Object.assign(night.killer, { mode: "patrol", x: 0, z: 36, yaw: Math.PI, path: [], timer: 0 });
  const behind = { x: 0, z: 36 + 8 };
  const events = stepNight(night, 0.05, { ...behind, ...idle, moving: true, sprinting: true });
  assert.ok(events.some((e) => e.type === "heard"));
  assert.equal(night.killer.mode, "investigate");
});

test("he spots a survivor in front of him and gives chase", () => {
  const night = createNight(seeded(14));
  Object.assign(night.killer, { mode: "patrol", x: 0, z: 20, yaw: 0, path: [] });
  const events = wait(night, { x: 0, z: 30 }, 0.1);
  assert.ok(events.some((e) => e.type === "spotted"));
  assert.equal(night.killer.mode, "chase");
});

/** A hedge and a spot 8 m away with a clear view of it. */
function watchedHedge(night: Night) {
  for (const hedge of HIDE_SPOTS.filter((h) => h.kind === "hedge"))
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const from = { x: hedge.x + Math.sin(a) * 8, z: hedge.z + Math.cos(a) * 8 };
      if (walkable(night.grid, from.x, from.z) && lineOfSight(night.grid, from, hedge))
        return { hedge, from };
    }
  throw new Error("no hedge in plain view");
}

test("if he watches you hide, that's the first place he looks", () => {
  const night = createNight(seeded(15));
  const { hedge, from } = watchedHedge(night);
  Object.assign(night.killer, { mode: "chase", ...from, path: [] });
  night.killer.yaw = Math.atan2(hedge.x - from.x, hedge.z - from.z);
  wait(night, hedge, 0.05);
  tapE(night, hedge);
  assert.equal(night.survivor.hidden, true);
  const events = wait(night, hedge, 14);
  assert.ok(events.some((e) => e.type === "pulledOut"));
  assert.ok(events.some((e) => e.type === "hit"));
});

test("one stab injures, a second kills", () => {
  const night = createNight(seeded(16));
  const at = { x: 0, z: 30 };
  Object.assign(night.killer, { mode: "chase", x: 0, z: 29, yaw: 0, path: [] });
  const first = wait(night, at, KILLER.windup + 0.2);
  assert.ok(first.some((e) => e.type === "hit" && e.health === 1));
  const second = wait(night, at, KILLER.hitRecover + KILLER.windup + 1);
  assert.ok(second.some((e) => e.type === "escaped" && e.outcome === "dead"));
});

// --- Balance ------------------------------------------------------------------
// Bots play whole nights through the same E-key interface a player uses: they
// open doors in their way, hold E to search, press E to pick up and to hide.
// Both walk at 4.8 m/s and sprint at 7.5 m/s, freeze for a human-sized beat
// when he jumps out, and path around walls and furniture. The careful one runs
// when chased (for hedges and open ground while he's watching, not dead-end
// rooms), and sneaks away while he searches; the careless one just loots.

function playNight(seed: number, careful: boolean, maxTime = 900) {
  const night = createNight(seeded(seed));
  const me = { x: LANE_START[0], z: LANE_START[2] };
  let path: Point[] = [],
    goalKey = "",
    t = 0,
    hits = 0,
    hiding = -1,
    frozen = 0,
    released = true;
  const dt = 1 / 20;
  while (t < maxTime && !night.outcome) {
    const k = night.killer;
    const gap = d(k, me);
    const chased = (k.mode === "chase" || k.mode === "attack" || k.mode === "recover") && gap < 22;
    const searchingNear = (k.mode === "search" || k.mode === "investigate") && gap < 14;
    const hidden = night.survivor.hidden;
    let goal: Point,
      key: string,
      sprint = false,
      want: "none" | "hold" | "press" = "none";
    const away = (far: number, hedgesOnly: boolean) => {
      const options = HIDE_SPOTS.map((h, i) => ({ h, i })).filter(
        ({ h }) =>
          (!hedgesOnly || h.kind === "hedge") &&
          d(h, k) > far &&
          d(h, me) < 35 &&
          d(h, k) > d(h, me) + 3,
      );
      options.sort((a, b) => d(a.h, me) - d(b.h, me));
      return options[0]?.i ?? -1;
    };
    if (careful && (chased || searchingNear || (hidden && gap < 22 && k.mode !== "patrol"))) {
      if (hidden) {
        goal = me;
        key = "stay";
      } else {
        const seen = chased && (k.lostFor < 0.4 || gap < 11);
        // While he's watching, run for open ground and hedges, not dead-end rooms.
        if (hiding < 0 || d(HIDE_SPOTS[hiding], k) < 10) hiding = away(12, seen);
        if (hiding >= 0 && !(seen && d(me, HIDE_SPOTS[hiding]) < 2.5)) {
          goal = HIDE_SPOTS[hiding];
          key = "hide" + hiding;
          sprint = chased && d(me, goal) > 1.2;
          if (d(me, goal) < HIDE_SPOTS[hiding].r && !hidden) want = "press";
        } else {
          // Run directly away; if he's on top of you, away from where he faces.
          let ax = me.x - k.x,
            az = me.z - k.z;
          if (Math.hypot(ax, az) < 1) {
            ax = -Math.sin(k.yaw);
            az = -Math.cos(k.yaw);
          }
          const len = Math.hypot(ax, az);
          goal = { x: me.x + (ax / len) * 12, z: me.z + (az / len) * 12 };
          key = "flee" + Math.round(t * 2);
          sprint = chased;
        }
      }
    } else {
      hiding = -1;
      if (hidden) want = "press";
      const revealed = night.revealed.findIndex((p) => p);
      if (night.policeHere) {
        goal = POLICE_STOP;
        key = "police";
      } else if (revealed >= 0) {
        goal = SEARCH_SPOTS[revealed];
        key = "pick" + revealed;
      } else if (canStartCar(night)) {
        goal = ESCAPE_CAR;
        key = "car";
      } else if (night.found.fuse && night.police < 0) {
        goal = PAYPHONE;
        key = "phone";
      } else {
        let best = -1,
          bd = Infinity;
        SEARCH_SPOTS.forEach((p, i) => {
          if (night.live[i] && !night.searched[i] && d(p, me) < bd) {
            bd = d(p, me);
            best = i;
          }
        });
        goal = SEARCH_SPOTS[best];
        key = "spot" + best;
      }
      const focus = findFocus(night, me);
      if (focus && d(me, goal) < (key === "car" ? 3.2 : 2)) {
        if (focus.kind === "pickup" && key.startsWith("pick")) want = "press";
        if (
          (focus.kind === "search" && key.startsWith("spot")) ||
          (focus.kind === "car" && key === "car") ||
          (focus.kind === "phone" && key === "phone")
        )
          want = "hold";
      }
    }
    if (key !== goalKey || !path.length) {
      path = findPath(night.grid, me, goal);
      goalKey = key;
    }
    frozen = Math.max(0, frozen - dt);
    const speed = frozen > 0 ? 0 : sprint && sprintAllowed(night) ? 7.5 : 4.8;
    let budget = speed * dt,
      moving = false;
    const reach = key === "car" ? 2.6 : key === "phone" ? 1.2 : key.startsWith("hide") ? 0.4 : 0.6;
    // A closed door ahead: stop and open it (tap E: press, then release).
    let doorAhead = -1;
    if (path.length) {
      const n = path[0],
        gp = d(n, me);
      if (gp > 1e-3) {
        const door = doorAt(
          night.grid,
          me.x + ((n.x - me.x) / gp) * 0.6,
          me.z + ((n.z - me.z) / gp) * 0.6,
        );
        if (door >= 0 && !night.doors[door].open) doorAhead = door;
      }
    }
    if (doorAhead >= 0) want = released ? "press" : "none";
    else if (d(me, goal) > reach && want !== "hold")
      while (budget > 0 && path.length) {
        const n = path[0],
          gp = d(n, me);
        if (gp < 1e-3) {
          path.shift();
          continue;
        }
        const step = Math.min(gp, budget);
        me.x += ((n.x - me.x) / gp) * step;
        me.z += ((n.z - me.z) / gp) * step;
        budget -= step;
        moving = true;
        if (step >= gp) path.shift();
      }
    const press: boolean = want === "press" && released;
    const interact: boolean = want === "hold" || press;
    released = !interact;
    for (const e of stepNight(night, dt, {
      x: me.x,
      z: me.z,
      moving,
      sprinting: sprint && moving,
      // Careless survivors never switch the flashlight off; careful ones do once he's on to them.
      flashlight: !careful || k.mode === "patrol" || k.mode === "dormant",
      interact,
      press,
    })) {
      if (e.type === "hit") hits++;
      if (e.type === "pulledOut" || e.type === "spotted") frozen = 0.3;
    }
    t += dt;
  }
  return {
    outcome: night.outcome ?? "timeout",
    t: Math.round(t),
    hits,
    parts: Object.values(night.found).filter(Boolean).length,
  };
}

const seeds = Array.from({ length: 24 }, (_, i) => i + 1);

test("balance: a careful survivor gets out more often than not", () => {
  const nights = seeds.map((seed) => playNight(seed, true));
  const escaped = nights.filter((n) => n.outcome === "car" || n.outcome === "police").length;
  assert.ok(escaped >= seeds.length * 0.55, `escaped ${escaped}/${seeds.length}`);
  assert.equal(nights.filter((n) => n.outcome === "timeout").length, 0);
});

test("balance: ignoring the killer usually gets you killed", () => {
  const nights = seeds.map((seed) => playNight(seed, false));
  const dead = nights.filter((n) => n.outcome === "dead").length;
  assert.ok(dead >= seeds.length * 0.5, `died ${dead}/${seeds.length}`);
  assert.equal(nights.filter((n) => n.outcome === "timeout").length, 0);
});
