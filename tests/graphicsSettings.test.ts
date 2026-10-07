import assert from "node:assert/strict";
import test from "node:test";
import {
  graphicsPresets,
  patchGraphicsSettings,
  readGraphicsSettings,
} from "../src/gameplay/graphicsSettings.ts";

void test("presets apply every graphics control while preserving bindings and sound", () => {
  const current = { ...graphicsPresets.high, soundVolume: 42, bindings: { dodge: "Space" } };
  const low = patchGraphicsSettings(current, { graphicsPreset: "low" });
  for (const key of Object.keys(graphicsPresets.low))
    assert.equal(
      low[key as keyof typeof low],
      graphicsPresets.low[key as keyof typeof graphicsPresets.low],
    );
  assert.equal(low.soundVolume, 42);
  assert.equal(low.bindings, current.bindings);
  assert.equal(patchGraphicsSettings(low, { soundVolume: 20 }).graphicsPreset, "low");
  assert.equal(patchGraphicsSettings(low, { bloom: true }).graphicsPreset, "custom");
  assert.equal(patchGraphicsSettings(low, { bloom: false }).graphicsPreset, "low");
});

void test("saved custom graphics and legacy resolution survive validation", () => {
  assert.deepEqual(readGraphicsSettings(graphicsPresets.ultra), graphicsPresets.ultra);
  const custom = patchGraphicsSettings(graphicsPresets.high, {
    shadows: "off",
    particleDetail: "off",
    frameTarget: 30,
  });
  assert.deepEqual(readGraphicsSettings(custom), custom);
  const legacy = readGraphicsSettings({ resolution: 1.5, adaptiveResolution: false });
  assert.equal(legacy.resolution, 1.5);
  assert.equal(legacy.adaptiveResolution, false);
  assert.equal(legacy.graphicsPreset, "custom");
});

void test("malformed saved controls cannot select prototype properties or exceed render limits", () => {
  assert.deepEqual(
    readGraphicsSettings({
      graphicsPreset: "constructor",
      resolution: Infinity,
      frameTarget: 120,
      shadows: "extreme",
      bloom: "false",
    }),
    graphicsPresets.medium,
  );
  assert.equal(readGraphicsSettings({ resolution: 99 }).resolution, 2);
  assert.equal(readGraphicsSettings({ resolution: -10 }).resolution, 0.75);
});
