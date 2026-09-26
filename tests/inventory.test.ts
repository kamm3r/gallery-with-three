import test from "node:test";
import assert from "node:assert/strict";
import {
  addItem,
  closeInventory,
  getInventory,
  hasItem,
  isOn,
  MAX_SLOTS,
  openInventory,
  removeItem,
  activateSlot,
  type ItemDef,
} from "../src/gameplay/inventory.ts";

const catalogue: ItemDef[] = [
  { id: "flashlight", name: "Flashlight", description: "", icon: "flashlight", toggle: true },
  { id: "keys", name: "Car keys", description: "", icon: "key" },
];

test("each portal opens its own inventory with its starting items", () => {
  openInventory("seasons", catalogue, [{ id: "flashlight", on: true }]);
  assert.equal(getInventory().scope, "seasons");
  assert.ok(hasItem("flashlight"));
  assert.ok(isOn("flashlight"));
  assert.equal(hasItem("keys"), false);
});

test("leaving the portal clears it, but only if it's still that portal's", () => {
  openInventory("seasons", catalogue, [{ id: "flashlight" }]);
  closeInventory("gallery");
  assert.ok(hasItem("flashlight"));
  closeInventory("seasons");
  assert.equal(getInventory().scope, null);
  assert.equal(hasItem("flashlight"), false);
});

test("items are added and removed; unknown items and a full bag are refused", () => {
  openInventory("seasons", catalogue);
  assert.equal(addItem("crowbar"), false);
  assert.ok(addItem("keys"));
  assert.ok(hasItem("keys"));
  assert.ok(removeItem("keys"));
  assert.equal(hasItem("keys"), false);
  for (let i = 0; i < MAX_SLOTS; i++) addItem("keys");
  assert.equal(addItem("keys"), false);
});

test("using a toggle item switches it; other items are just selected", () => {
  openInventory("seasons", catalogue, [{ id: "flashlight", on: true }, { id: "keys" }]);
  assert.equal(activateSlot(0)?.on, false);
  assert.equal(isOn("flashlight"), false);
  assert.equal(activateSlot(0)?.on, true);
  const keys = activateSlot(1);
  assert.equal(keys?.item.id, "keys");
  assert.equal(getInventory().selected, 1);
  assert.equal(activateSlot(5), null);
});

test("subscribers hear about changes", async () => {
  const { subscribeInventory } = await import("../src/gameplay/inventory.ts");
  let calls = 0;
  const stop = subscribeInventory(() => calls++);
  openInventory("seasons", catalogue);
  addItem("keys");
  stop();
  addItem("keys");
  assert.equal(calls, 2);
});

test("consumables are spent only when the world says they did something", async () => {
  const { onUse } = await import("../src/gameplay/inventory.ts");
  openInventory("seasons", [
    ...catalogue,
    { id: "medkit", name: "Med kit", description: "", icon: "medkit", consumable: true },
  ]);
  addItem("medkit");
  let hurt = false;
  const stop = onUse((id) => id === "medkit" && hurt);
  assert.equal(activateSlot(0)?.spent, false);
  assert.ok(hasItem("medkit"));
  hurt = true;
  assert.equal(activateSlot(0)?.spent, true);
  assert.equal(hasItem("medkit"), false);
  stop();
});
