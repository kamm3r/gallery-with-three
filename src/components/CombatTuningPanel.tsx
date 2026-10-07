import { useControls, Leva } from "leva";
import { useEffect } from "react";
import { combatTuning } from "../gameplay/combatTuning";

export function CombatTuningPanel() {
  const values = useControls("Combat / Hitbox", {
    hitDistance: {
      value: combatTuning.hitDistance,
      min: 1,
      max: 6,
      step: 0.1,
      label: "Sword range",
    },
    hitFacingThreshold: {
      value: combatTuning.hitFacingThreshold,
      min: -0.5,
      max: 0.9,
      step: 0.05,
      label: "Facing threshold",
    },
    hitWindowStart: {
      value: combatTuning.hitWindowStart,
      min: 0,
      max: 0.9,
      step: 0.05,
      label: "Hit window start",
    },
    hitWindowEnd: {
      value: combatTuning.hitWindowEnd,
      min: 0.1,
      max: 1,
      step: 0.05,
      label: "Hit window end",
    },
    swordTipOffset: {
      value: combatTuning.swordTipOffset,
      min: 0,
      max: 2,
      step: 0.05,
      label: "Tip offset (-Z)",
    },
    swordTipRadius: {
      value: combatTuning.swordTipRadius,
      min: 0.1,
      max: 1.5,
      step: 0.05,
      label: "Tip radius",
    },
    showHitbox: { value: combatTuning.showHitbox, label: "Show hitbox" },
  });

  const boss = useControls("Boss — Stats", {
    bossMaxHealth: {
      value: combatTuning.bossMaxHealth,
      min: 50,
      max: 1000,
      step: 10,
      label: "Boss HP",
    },
    playerMaxHealth: {
      value: combatTuning.playerMaxHealth,
      min: 20,
      max: 300,
      step: 5,
      label: "Player HP",
    },
    enrageThreshold: {
      value: combatTuning.enrageThreshold,
      min: 10,
      max: 500,
      step: 10,
      label: "Enrage HP",
    },
    baseDamage: {
      value: combatTuning.baseDamage,
      min: 1,
      max: 100,
      step: 1,
      label: "Sword base dmg",
    },
    recoveryBonusDamage: {
      value: combatTuning.recoveryBonusDamage,
      min: 0,
      max: 50,
      step: 1,
      label: "+ Recovery dmg",
    },
    bossDamage: { value: combatTuning.bossDamage, min: 1, max: 100, step: 1, label: "Boss dmg" },
  });

  const stamina = useControls("Boss — Stamina", {
    attackStaminaCost: {
      value: combatTuning.attackStaminaCost,
      min: 0,
      max: 60,
      step: 1,
      label: "Attack cost",
    },
    rollStaminaCost: {
      value: combatTuning.rollStaminaCost,
      min: 0,
      max: 60,
      step: 1,
      label: "Roll cost",
    },
    staminaRegen: { value: combatTuning.staminaRegen, min: 0, max: 60, step: 1, label: "Regen /s" },
  });

  const motion = useControls("Boss — Motion", {
    approachSpeed: {
      value: combatTuning.approachSpeed,
      min: 0.2,
      max: 8,
      step: 0.1,
      label: "Approach spd",
    },
    approachSpeedEnraged: {
      value: combatTuning.approachSpeedEnraged,
      min: 0.2,
      max: 10,
      step: 0.1,
      label: "Enraged spd",
    },
    approachStopDistance: {
      value: combatTuning.approachStopDistance,
      min: 0.5,
      max: 6,
      step: 0.1,
      label: "Stop dist",
    },
    bossStrikeRange: {
      value: combatTuning.bossStrikeRange,
      min: 1,
      max: 10,
      step: 0.1,
      label: "Strike reach",
    },
  });

  const phases = useControls("Boss — Phases", {
    windupDuration: {
      value: combatTuning.windupDuration,
      min: 0.1,
      max: 3,
      step: 0.05,
      label: "Windup",
    },
    windupDurationEnraged: {
      value: combatTuning.windupDurationEnraged,
      min: 0.1,
      max: 3,
      step: 0.05,
      label: "Windup enraged",
    },
    strikeDuration: {
      value: combatTuning.strikeDuration,
      min: 0.05,
      max: 1,
      step: 0.05,
      label: "Strike",
    },
    recoveryDuration: {
      value: combatTuning.recoveryDuration,
      min: 0.2,
      max: 4,
      step: 0.1,
      label: "Recovery",
    },
    recoveryDurationEnraged: {
      value: combatTuning.recoveryDurationEnraged,
      min: 0.2,
      max: 4,
      step: 0.1,
      label: "Recovery enraged",
    },
  });

  const diagnostics = useControls("Diagnostics", {
    perfEnabled: { value: combatTuning.perfEnabled, label: "r3f-perf overlay" },
  });

  useEffect(() => {
    Object.assign(combatTuning, values, boss, stamina, motion, phases, diagnostics);
  }, [values, boss, stamina, motion, phases, diagnostics]);

  return (
    <Leva
      collapsed={false}
      hidden={false}
      titleBar={{ title: "⚔ Combat tuning", drag: true }}
      theme={{ sizes: { rootWidth: "360px" } }}
    />
  );
}
