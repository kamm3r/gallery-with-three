import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { applyPointLightBudget } from "../src/gameplay/pointLightBudget.ts";

void test("point lights keep a bounded count and follow the camera between areas", () => {
  const lights = Array.from({ length: 21 }, (_, index) => {
    const light = new THREE.PointLight();
    light.position.x = index * 10;
    return light;
  });
  applyPointLightBudget(lights, new THREE.Vector3(), 4);
  assert.equal(lights.filter((light) => light.visible).length, 4);
  assert.ok(lights.slice(0, 4).every((light) => light.visible));
  applyPointLightBudget(lights, new THREE.Vector3(200, 0, 0), 4);
  assert.equal(lights.filter((light) => light.visible).length, 4);
  assert.ok(lights.slice(-4).every((light) => light.visible));
});
void test("hidden or extinguished emitters do not take an active light slot", () => {
  const hidden = new THREE.Group();
  hidden.visible = false;
  const a = new THREE.PointLight();
  hidden.add(a);
  const b = new THREE.PointLight();
  b.intensity = 0;
  const c = new THREE.PointLight();
  c.position.x = 10;
  applyPointLightBudget([a, b, c], new THREE.Vector3(), 1);
  assert.equal(a.visible, false);
  assert.equal(b.visible, false);
  assert.equal(c.visible, true);
});
