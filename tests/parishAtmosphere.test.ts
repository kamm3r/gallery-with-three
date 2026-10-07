import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  buildParishAtmosphere,
  createParishAir,
  stepParishAir,
} from "../src/gameplay/parishAtmosphere.ts";
import { createRuntimeWorld } from "../src/gameplay/ecs/world.ts";
import { createStateBinding, GameplayState } from "../src/gameplay/ecs/stateBinding.ts";
import { applyPointLightBudget } from "../src/gameplay/pointLightBudget.ts";
import { parishTorches } from "../src/gameplay/parishDressingPlan.ts";

void test("flame volume preserves emitter height, has depth and fits inside its culling bounds", () => {
  const atmosphere = buildParishAtmosphere();
  try {
    for (const blue of [false, true]) {
      const flames = atmosphere.root.getObjectByName(
        blue ? "blue-funeral-flames" : "warm-flames",
      ) as THREE.InstancedMesh;
      const torches = parishTorches.filter((torch) => torch.blue === blue);
      const matrix = new THREE.Matrix4();
      const box = new THREE.Box3();
      flames.geometry.computeBoundingBox();
      torches.forEach((torch, i) => {
        flames.getMatrixAt(i, matrix);
        box.copy(flames.geometry.boundingBox!).applyMatrix4(matrix);
        assert.ok(
          box.max.z - box.min.z > 0.8 * torch.scale,
          "fire has physical depth around the coals",
        );
        assert.ok(Math.abs(box.min.y - (torch.position[1] + 0.28 * torch.scale)) < 0.00001);
        assert.ok(flames.boundingBox!.containsBox(box));
      });
    }
  } finally {
    atmosphere.dispose();
  }
});

void test("parish wind and fire use an entity-owned game clock with bounded resume steps", () => {
  const world = createRuntimeWorld();
  const air = createStateBinding(world, "parish-air", createParishAir);
  const unmount = air.mount();
  try {
    const stored = world.queryFirst(GameplayState)!.get(GameplayState)!;
    assert.equal(stored.value, air.current);
    stepParishAir(air.current, 1 / 60, false);
    assert.equal((stored.value as ReturnType<typeof createParishAir>).time, 1 / 60);
    const before = air.current.time;
    stepParishAir(air.current, 10, true);
    assert.equal(air.current.time, before + 0.05);
    assert.equal(air.current.motion, 0);
    stepParishAir(air.current, -1, false);
    assert.equal(air.current.time, before + 0.05);
    assert.equal(air.current.motion, 1);
  } finally {
    unmount();
    assert.equal(world.query(GameplayState).length, 0);
    world.destroy();
  }
});

void test("fire animation keeps particle buffers static and preserves the light budget and reduced-motion setting", () => {
  const atmosphere = buildParishAtmosphere();
  try {
    const buffers: Array<{ data: ArrayLike<number>; before: number[] }> = [];
    let particleCount = 0,
      flameDraws = 0;
    atmosphere.root.traverse((o) => {
      if (o instanceof THREE.Points) {
        particleCount += o.geometry.getAttribute("position").count;
        const data = o.geometry.getAttribute("position").array;
        buffers.push({ data, before: Array.from(data) });
      }
      if (o instanceof THREE.InstancedMesh) {
        flameDraws++;
        buffers.push({ data: o.instanceMatrix.array, before: Array.from(o.instanceMatrix.array) });
      }
    });
    assert.equal(flameDraws, 2, "many braziers share two flame submissions");
    assert.ok(particleCount > 0 && particleCount <= 256);
    applyPointLightBudget(
      atmosphere.lights.map(({ light }) => light),
      new THREE.Vector3(0, 4, 140),
      4,
    );
    const air = createParishAir();
    for (let i = 0; i < 600; i++) {
      stepParishAir(air, 1 / 60, false);
      atmosphere.update(air);
    }
    assert.equal(atmosphere.lights.filter(({ light }) => light.visible).length, 4);
    assert.ok(
      atmosphere.lights.every(
        ({ light, base }) => Math.abs(light.intensity - base) <= base * 0.081,
      ),
    );
    assert.ok(
      buffers.every(({ data, before }) => Array.from(data).every((v, i) => v === before[i])),
    );
    stepParishAir(air, 1 / 60, true);
    atmosphere.update(air);
    assert.equal(atmosphere.particles.visible, false);
    assert.equal(atmosphere.motion.value, 0);
    assert.ok(atmosphere.lights.every(({ light, base }) => light.intensity === base));
    stepParishAir(air, 1 / 60, false);
    atmosphere.update(air);
    assert.equal(atmosphere.particles.visible, true);
  } finally {
    atmosphere.dispose();
  }
});

void test("leaving the parish releases shared flame and particle resources once", () => {
  const atmosphere = buildParishAtmosphere();
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  atmosphere.root.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
      resources.add(o.geometry);
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => resources.add(m));
    }
  });
  const disposed = new Map<object, number>();
  for (const resource of resources)
    resource.addEventListener("dispose", () =>
      disposed.set(resource, (disposed.get(resource) ?? 0) + 1),
    );
  atmosphere.dispose();
  assert.equal(disposed.size, resources.size);
  assert.ok([...disposed.values()].every((count) => count === 1));
});
void test("particle groups are culled with bounds covering the complete shader trajectory", () => {
  const atmosphere = buildParishAtmosphere();
  try {
    const groups: THREE.Points[] = [];
    atmosphere.particles.traverse((o) => {
      if (o instanceof THREE.Points) groups.push(o);
    });
    assert.ok(groups.length > 2, "separate cells allow offscreen braziers to be culled");
    for (const points of groups) {
      assert.equal(points.frustumCulled, true);
      const geometry = points.geometry,
        positions = geometry.getAttribute("position"),
        heights = geometry.getAttribute("height"),
        seeds = geometry.getAttribute("seed");
      const smoke = (points.material as THREE.ShaderMaterial).uniforms.smoke.value as number;
      assert.ok(geometry.boundingBox && geometry.boundingSphere);
      for (let i = 0; i < positions.count; i++)
        for (let step = 0; step <= 20; step++) {
          const age = step / 20,
            seed = seeds.getX(i);
          const p = new THREE.Vector3(
            positions.getX(i) + age * age * (smoke ? 3 : 0.9) + Math.sin(age * 9 + seed * 10) * 0.2,
            positions.getY(i) + age * heights.getX(i),
            positions.getZ(i) + Math.sin(age * 5 + seed * 8) * age,
          );
          assert.ok(geometry.boundingBox.containsPoint(p));
          assert.ok(geometry.boundingSphere.containsPoint(p));
        }
    }
    const geometry = groups.map((p) => p.geometry),
      counts = geometry.map((g) => g.getAttribute("position").count);
    atmosphere.setDetail("low");
    assert.ok(groups.every((p, i) => p.geometry.drawRange.count < counts[i]));
    atmosphere.setDetail("off");
    atmosphere.update(createParishAir());
    assert.equal(atmosphere.particles.visible, false);
    atmosphere.setDetail("high");
    atmosphere.update(createParishAir());
    assert.equal(atmosphere.particles.visible, true);
    assert.ok(
      groups.every(
        (p, i) => p.geometry === geometry[i] && p.geometry.drawRange.count === counts[i],
      ),
    );
  } finally {
    atmosphere.dispose();
  }
});
