import { houndAir, houndFlightFoot } from "./houndAttacks.ts";
import { enemyAttackSpec } from "./enemyAttacks.ts";
import { parishWindupDuration } from "./parishEncounter.ts";
import * as THREE from "three";
import type { ParishRig } from "./parishModels.ts";
import type { ParishEnemy } from "./parishEncounter.ts";
import { parishEnemyPose } from "./parishAnimation.ts";
import { enemySpecs } from "./ashenParish.ts";
import { enemyFoot, enemyMotion } from "./enemyMotion.ts";

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const world = (rig: ParishRig, p: THREE.Vector3) => rig.root.localToWorld(p.clone());
const deaths = {
  sentinel: [0.15, 1.25, 0.3],
  acolyte: [0.65, -0.08, 0.55],
  hound: [0.1, 1.45, 0.57],
  kiln: [0.75, 0.25, 0.55],
  clinger: [0.5, 0.4, 0.28],
  widow: [0.2, -1.05, 0.6],
  bearer: [1.25, 0.1, 0.45],
} as const;

/** Anatomical hinges are local X: elbows flex -X, human knees +X. */
export function applyParishRigPose(
  rig: ParishRig,
  e: ParishEnemy,
  time: number,
  gentle = false,
  delta?: number,
) {
  const p = parishEnemyPose(e, time, gentle),
    m = enemyMotion(e, time, gentle),
    j = rig.joints;
  const response = e.phase === "strike" ? 45 : 22;
  const approach = (a: number, b: number) =>
    delta === undefined ? b : THREE.MathUtils.damp(a, b, response, Math.min(delta, 0.1));
  const die = deaths[e.kind],
    alive = e.phase !== "dead";
  const pouncing =
    e.kind === "hound" && (e.houndAttack ?? "pounce") === "pounce" && e.phase === "strike";
  const air = pouncing ? houndAir(e.timer) : { height: 0, tuck: 0, land: 0 };
  const leap = air.height;
  rig.root.position.y = approach(rig.root.position.y, leap - p.sink - p.death * 0.12);
  const bind = j.body.userData.bindPosition as THREE.Vector3;
  const baseHip = e.kind === "clinger" ? 0.5 + p.fold * 0.06 : bind.y;
  j.body.position.y = approach(j.body.position.y, baseHip - m.drop - p.death * die[2]);
  const authoredLean = e.kind === "sentinel" ? p.lean : m.lean;
  const lean = e.kind === "clinger" ? authoredLean * (1 - p.fold) : authoredLean;
  j.body.position.z = approach(j.body.position.z, bind.z + m.hipZ);
  const twist = e.kind === "sentinel" ? p.twist : m.twist;
  j.body.rotation.set(
    approach(j.body.rotation.x, lean * (1 - p.death) + p.death * die[0]),
    approach(j.body.rotation.y, twist * (1 - p.death)),
    approach(j.body.rotation.z, m.sway + p.roll + p.death * die[1]),
  );
  if (j.head)
    j.head.rotation.set(-lean * 0.4 + m.neck + p.death * 0.3, -twist * 0.28 + m.neckYaw, 0);
  if (e.kind === "hound" && j.head) {
    const rest = j.head.userData.bindPosition as THREE.Vector3;
    j.head.position.z = rest.z + m.reach * 0.055;
    j.head.rotation.z = -m.sway * 0.65 + m.neckRoll;
  }
  for (const [suffix, arm, spread, yaw, elbow] of [
    ["R", m.armR, m.outR, m.yawR, m.elbowR],
    ["L", m.armL, m.outL, m.yawL, m.elbowL],
  ] as const) {
    const shoulder = j[`arm${suffix}`],
      forearm = j[`forearm${suffix}`];
    if (shoulder) shoulder.rotation.set(approach(shoulder.rotation.x, arm), yaw, spread);
    if (forearm) forearm.rotation.set(-Math.max(0, Math.min(2.4, elbow)), 0, 0);
    if (j[`hand${suffix}`]) j[`hand${suffix}`].rotation.set(0, 0, 0);
  }
  if (j.bell)
    j.bell.rotation.z =
      -0.12 +
      (e.phase === "strike"
        ? Math.sin(e.timer * 22) *
          0.1 *
          Math.sin(Math.PI * Math.min(1, e.timer / enemySpecs.widow.strike))
        : Math.sin(m.cycle) * m.walk * 0.045) -
      p.death * 0.35;
  rig.root.updateMatrixWorld(true);
  for (const suffix of ["FL", "FR", "BL", "BR"] as const) {
    const upper = j[`leg${suffix}`],
      lower = j[`knee${suffix}`],
      foot = j[`foot${suffix}`];
    if (!upper || !lower || !foot) continue;
    const right = suffix.endsWith("R"),
      front = suffix.startsWith("F"),
      side = right ? 1 : -1;
    if (!alive) {
      upper.rotation.set(-0.35 * p.death, 0, side * 0.12 * p.death);
      lower.rotation.set((e.kind === "hound" ? 1.7 : 1.25) * p.death, 0, 0);
      continue;
    }
    const dog = e.kind === "hound";
    // Keep one coordinated diagonal trot as speed changes; switching phase
    // offsets on acceleration makes paws teleport between gait cycles.
    const offset = dog
      ? front
        ? right
          ? 0.5
          : 0
        : right
          ? 0
          : 0.5
      : right
        ? e.kind === "widow"
          ? 0.62
          : 0.5
        : 0;
    const step = enemyFoot(e, offset);
    const flight = pouncing
      ? houndFlightFoot(e.timer, front, right)
      : { x: 0, y: 0, z: 0, pitch: 0 };
    // A bite drives the chest over planted paws. Only the jumping attack
    // reaches all four feet with the body; doing so on a snap causes skating.
    const reach = dog && (e.houndAttack ?? "pounce") === "pounce" ? m.reach : 0;
    const x = dog
      ? side * (front ? 0.235 : 0.18)
      : side * (e.kind === "kiln" ? 0.28 : e.kind === "bearer" ? 0.25 : 0.15);
    const restZ = dog
      ? front
        ? right
          ? 0.49
          : 0.37
        : right
          ? -0.9
          : -0.6
      : e.kind === "clinger"
        ? -0.08
        : 0;
    const z = dog
      ? THREE.MathUtils.lerp(restZ, front ? 0.43 : -0.72, Math.min(1, m.walk * 3))
      : restZ;
    // Feet stay in the character's frame, including its facing yaw.
    const target = world(
      rig,
      v(
        x + flight.x,
        0.045 + step.y + flight.y,
        z + step.z + flight.z + (front ? 0.35 : -0.1) * reach,
      ),
    );
    const pole = world(rig, v(x, 0.4, z + (dog && front ? -0.6 : 0.6)));
    const hock = dog && !front ? j[`hock${suffix}`] : undefined;
    // The rear IK chain ends at the raised hock. The metatarsal reaches down
    // and forward to the paw, preserving a canine stifle/hock silhouette.
    const ikTarget = hock
      ? world(
          rig,
          v(
            x + flight.x,
            0.045 + step.y + flight.y + 0.24,
            z + step.z + flight.z - 0.1 * reach - 0.14,
          ),
        )
      : target;
    solveEnemyLimb(upper, lower, ikTarget, pole, dog && front ? -1 : 1);
    if (hock) orientInRoot(rig, hock, new THREE.Quaternion());
    const pawPitch = dog ? flight.pitch + Math.min(1, step.y / 0.12) * 0.3 : 0;
    orientInRoot(rig, foot, new THREE.Quaternion().setFromEuler(new THREE.Euler(pawPitch, 0, 0)));
  }
  rig.root.updateMatrixWorld(true);
  if (alive && e.kind === "clinger") {
    for (const side of [-1, 1]) {
      const suffix = side < 0 ? "L" : "R";
      if (p.fold > 0.97) {
        j[`arm${suffix}`].rotation.set(-0.05, 0, -side * 0.25);
        j[`forearm${suffix}`].rotation.set(-0.75, 0, 0);
        continue;
      }
      const step = enemyFoot(e, side < 0 ? 0.5 : 0),
        attacking = ["windup", "strike", "recovery"].includes(e.phase);
      const attackSide = (e.attackNumber % 2 === 0 ? -1 : 1) === side;
      let x = side * 0.4,
        z = 0.68 + step.z * 0.9,
        y = 0.045 + step.y * 1.6;
      if (attacking && attackSide) {
        x = side * m.toolX;
        z = m.toolZ;
        y = m.toolY;
      }
      const target = world(rig, v(x, y, z));
      solveEnemyLimb(
        j[`arm${suffix}`],
        j[`forearm${suffix}`],
        target,
        world(rig, v(side * 0.85, 0.5, 0.02)),
        -1,
      );
      orientInRoot(
        rig,
        j[`hand${suffix}`],
        attacking && attackSide
          ? new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.4, 0, 0))
          : new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, Math.PI)),
      );
    }
  }
  if (alive && e.kind === "acolyte") {
    for (const side of [-1, 1]) {
      const suffix = side < 0 ? "L" : "R";
      const target = world(
        rig,
        side < 0 ? v(m.offX, m.offY, m.offZ) : v(m.toolX, m.toolY, m.toolZ),
      );
      solveEnemyLimb(
        j[`arm${suffix}`],
        j[`forearm${suffix}`],
        target,
        world(rig, v(side * 0.65, 1.15, -0.25)),
        -1,
      );
      const cast = ["windup", "strike", "recovery"].includes(e.phase);
      if (cast)
        orientInRoot(
          rig,
          j[`hand${suffix}`],
          new THREE.Quaternion().setFromEuler(new THREE.Euler(side > 0 ? 0 : -0.5, 0, Math.PI)),
        );
    }
  }
  if (alive && e.kind === "widow") {
    const plant = enemyFoot(e, 0.2);
    solveEnemyLimb(
      j.armR,
      j.forearmR,
      world(rig, v(0.5, 0.05 + plant.y, 0.35 + plant.z)),
      world(rig, v(0.9, 0.8, -0.15)),
      -1,
    );
    orientInRoot(
      rig,
      j.handR,
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, Math.PI)),
    );
    const authoredWrist = world(rig, v(m.toolX, m.toolY, m.toolZ));
    const hammerHead = world(rig, v(m.tipX, m.tipY, m.tipZ));
    const cowl = j.bell.children.find((g) => g.name === "bronze-bell-cowl")!;
    const strikePoint = cowl.localToWorld(v(Math.cos(2.5) * 0.65, -0.18, Math.sin(2.5) * 0.55));
    hammerHead.lerp(strikePoint, m.impact);
    const headVector = v(0, -0.43, 0.025),
      handleLength = headVector.length() * rig.root.getWorldScale(new THREE.Vector3()).y;
    const direction = hammerHead.clone().sub(authoredWrist).normalize();
    const wrist = hammerHead.clone().addScaledVector(direction, -handleLength);
    solveEnemyLimb(j.armL, j.forearmL, wrist, world(rig, v(-1, 1.1, -0.25)), -1);
    const aim = new THREE.Quaternion().setFromUnitVectors(headVector.normalize(), direction);
    orientWorld(j.hammer, aim);
    orientWorld(j.handL, aim);
  }
  if (alive && e.kind === "bearer") {
    for (const side of [-1, 1]) {
      const suffix = side < 0 ? "L" : "R",
        step = enemyFoot(e, side < 0 ? 0 : 0.5);
      const plant = ["windup", "strike", "recovery"].includes(e.phase) ? 1 : 0;
      const target = world(rig, v(side * 0.58, 0.8 + step.y, 0.3 + step.z + plant * 0.22));
      solveEnemyLimb(
        j[`arm${suffix}`],
        j[`forearm${suffix}`],
        target,
        world(rig, v(side * 0.9, 1.2, -0.25)),
        -1,
      );
      const pole = j[`pole${suffix}`];
      orientInRoot(rig, pole, new THREE.Quaternion());
      const planted = world(rig, v(side * 0.58, 0.74 + step.y, 0.3 + step.z + plant * 0.22));
      pole.position.copy(pole.parent!.worldToLocal(planted));
    }
  }
  if (j.tool) {
    j.tool.position.set(m.toolX, m.toolY, m.toolZ);
    j.tool.rotation.set(m.toolPitch, m.toolYaw, -m.sway * 0.3, "YXZ");
    if (!alive) {
      j.tool.position.y = Math.max(0.12, 0.85 - p.death * 0.7);
      j.tool.rotation.x = -Math.PI / 2;
    }
    rig.root.updateMatrixWorld(true);
    if (alive)
      for (const side of [-1, 1]) {
        const suffix = side < 0 ? "L" : "R";
        const target = j.tool.localToWorld(v(0, side < 0 ? -0.23 : 0.02, 0.035));
        solveEnemyLimb(
          j[`arm${suffix}`],
          j[`forearm${suffix}`],
          target,
          world(rig, v(side * 0.85, 1, -0.25)),
          -1,
        );
        orientWorld(j[`hand${suffix}`], j.tool.getWorldQuaternion(new THREE.Quaternion()));
      }
  }
  if (j.shield)
    orientInRoot(
      rig,
      j.shield,
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.twist * 0.25, 0.08 + p.death * 0.6)),
    );
  if (j.tongL && j.tongR) {
    const opening =
      e.kilnAttack && e.kilnAttack !== "clamp"
        ? 0.14
        : e.phase === "windup"
          ? (e.comboStep ? 0 : 0.14) +
            Math.min(1, e.timer / parishWindupDuration(e)) * (e.comboStep ? 0.49 : 0.35)
          : e.phase === "strike"
            ? 0.49 * (1 - Math.min(1, e.timer / enemyAttackSpec(e).contact))
            : e.phase === "recovery"
              ? 0.14 * THREE.MathUtils.smoothstep(e.timer, 0, enemyAttackSpec(e).recovery)
              : 0.14;
    j.tongL.rotation.z = -opening;
    j.tongR.rotation.z = opening;
  }
  for (const suffix of ["L", "R"]) {
    const hand = j[`hand${suffix}`];
    if (!hand) continue;
    const grips =
      e.kind === "sentinel" ||
      e.kind === "kiln" ||
      e.kind === "bearer" ||
      (e.kind === "widow" && suffix === "L");
    const curl = grips
      ? 1.25
      : e.kind === "acolyte"
        ? 0.12 + p.castGlow * 0.45
        : e.kind === "clinger"
          ? 0.12
          : 0;
    for (const finger of (hand.userData.fingers ?? []) as {
      base: THREE.Group;
      tip: THREE.Group;
    }[]) {
      finger.base.rotation.x = -curl;
      finger.tip.rotation.x = -curl * 0.8;
    }
  }
  if (j.shrine) j.shrine.rotation.x = m.shrine + p.death * 0.28;
  if (j.jaw) j.jaw.rotation.x = e.kind === "hound" ? m.jaw : p.jaw;
  if (j.tail) {
    // A heavy, trailing tail counterbalances the turn rather than wagging like a pet.
    j.tail.rotation.y =
      e.kind === "hound"
        ? -m.twist * 0.65 + m.tailYaw + (gentle ? 0 : Math.sin(m.cycle - 0.8) * m.walk * 0.1)
        : gentle
          ? 0
          : Math.sin(time * 3 + m.cycle) * (0.08 + m.walk * 0.18);
    if (e.kind === "hound") j.tail.rotation.x = -m.lean * 0.45 - air.tuck * 0.15 + m.tailPitch;
  }
  rig.skin?.update();
  rig.impact?.update(e, gentle);
  return p;
}

/** Two-bone IK with an explicit anatomical bend pole and a single-axis lower hinge. */
export function solveEnemyLimb(
  upper: THREE.Group,
  lower: THREE.Group,
  target: THREE.Vector3,
  pole: THREE.Vector3,
  hingeSign: 1 | -1,
) {
  upper.parent!.updateWorldMatrix(true, false);
  const shoulder = upper.getWorldPosition(new THREE.Vector3());
  const scale = upper.getWorldScale(new THREE.Vector3()).length() / Math.sqrt(3);
  const first = (upper.userData.boneLength as number) * scale,
    second = (lower.userData.boneLength as number) * scale;
  const direction = target.clone().sub(shoulder),
    rawDistance = direction.length();
  if (rawDistance < 1e-7) return;
  direction.normalize();
  const distance = THREE.MathUtils.clamp(
    rawDistance,
    Math.sqrt(
      first * first + second * second + 2 * first * second * Math.cos(hingeSign < 0 ? 2.5 : 2.6),
    ),
    first + second - 0.0001,
  );
  const bend = pole.clone().sub(shoulder);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < 1e-8) {
    bend.set(1, 0, 0);
    bend.addScaledVector(direction, -bend.dot(direction));
  }
  bend.normalize();
  const along = (distance * distance + first * first - second * second) / (2 * distance);
  const elbow = shoulder
    .clone()
    .addScaledVector(direction, along)
    .addScaledVector(bend, Math.sqrt(Math.max(0, first * first - along * along)));
  const endpoint = shoulder.clone().addScaledVector(direction, distance);
  const u = elbow.clone().sub(shoulder).normalize(),
    w = endpoint.sub(elbow).normalize();
  const normal = u.clone().cross(w).multiplyScalar(hingeSign).normalize();
  const y = u.clone().negate(),
    z = normal.clone().cross(y).normalize();
  const rotation = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(normal, y, z),
  );
  orientWorld(upper, rotation);
  lower.rotation.set(hingeSign * Math.acos(THREE.MathUtils.clamp(u.dot(w), -1, 1)), 0, 0);
  upper.updateWorldMatrix(true, true);
}
function orientWorld(joint: THREE.Group, rotation: THREE.Quaternion) {
  joint.parent!.updateWorldMatrix(true, false);
  joint.quaternion.copy(
    joint.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation),
  );
}
function orientInRoot(rig: ParishRig, joint: THREE.Group, local: THREE.Quaternion) {
  orientWorld(joint, rig.root.getWorldQuaternion(new THREE.Quaternion()).multiply(local));
}
