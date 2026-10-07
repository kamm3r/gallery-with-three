import { useEcsRef } from "../hooks/useEcsRef";
import { useFrame } from "@react-three/fiber";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { useCallback, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { playSound } from "../gameplay/sound";
import { createPlatformerLink, type PlatformerLink } from "../gameplay/platformerLink";
import { CRATE_SIZE, enemyPosition, type Vec3, type WarpLevel } from "../gameplay/warpLevels";
import { stepRun, type RunEvent, type RunState } from "../gameplay/warpRun";
import { KinematicPlatform, PlatformSystem } from "./KinematicPlatform";
import { PortalFrameCollider } from "./PortalFrameCollider";
import { PortalPainting } from "./PortalPainting";
import { ThirdPersonPlayer } from "./ThirdPersonPlayer";
import { LevelDressing, LevelGround } from "./WarpScenery";
import {
  AkuMask,
  CrateMesh,
  Critter,
  Debris,
  FruitField,
  makeBurst,
  PowerCrystal,
  type Burst,
} from "./warpProps";

interface WarpLevelWorldProps {
  level: WarpLevel;
  run: MutableRefObject<RunState>;
  nearExit: boolean;
  onNearExit: (near: boolean) => void;
  onExit: () => void;
  onEvents: (events: RunEvent[]) => void;
  onReady: () => void;
}

const WOOD = "#c98a45";

/** Sun that tracks the player down the corridor so shadows stay crisp. */
function FollowSun({
  link,
  color,
  intensity,
}: {
  link: MutableRefObject<PlatformerLink>;
  color: string;
  intensity: number;
}) {
  const light = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    const sun = light.current;
    if (!sun) return;
    const { x, z } = link.current;
    sun.position.set(x - 14, 30, z + 18);
    sun.target.position.set(x, 0, z - 4);
    sun.target.updateMatrixWorld();
  });
  return (
    <directionalLight
      ref={light}
      castShadow
      color={color}
      intensity={intensity}
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
      shadow-camera-left={-28}
      shadow-camera-right={28}
      shadow-camera-top={28}
      shadow-camera-bottom={-28}
      shadow-camera-near={1}
      shadow-camera-far={90}
      shadow-normalBias={0.03}
    />
  );
}

export function WarpLevelWorld({
  level,
  run,
  nearExit,
  onNearExit,
  onExit,
  onEvents,
  onReady,
}: WarpLevelWorldProps) {
  const link = useEcsRef("platformer-player", createPlatformerLink);
  const teleport = useEcsRef<Vec3 | null>("teleport", () => null);
  const bursts = useRef<Burst[]>([]);
  const [, setCrateVersion] = useState(0);
  const boulder = useRef<THREE.Group>(null);
  const critters = useRef<(THREE.Group | null)[]>([]);
  const deadAt = useEcsRef("warp-enemy-deaths", () => level.enemies.map(() => -1));
  const rumble = useRef(0);
  const { theme } = level;

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const current = run.current;
    const l = link.current;
    const events = stepRun(
      current,
      { x: l.x, y: l.y, z: l.z, vy: l.vy, grounded: l.grounded, spinning: l.spinTime > 0 },
      dt,
    );
    let cratesChanged = false;
    for (const event of events) {
      switch (event.type) {
        case "crate": {
          const crate = level.crates[event.index];
          bursts.current.push(
            makeBurst(
              [crate.x, crate.y + CRATE_SIZE / 2, crate.z],
              crate.kind === "nitro" ? "#39c94a" : WOOD,
            ),
          );
          playSound("crate");
          cratesChanged = true;
          break;
        }
        case "bounce": {
          l.bounce = event.speed;
          const kind = event.index >= 0 ? level.crates[event.index].kind : "";
          if (kind === "spring" || kind === "bounce" || event.index < 0) playSound("boing");
          break;
        }
        case "fuse":
          playSound("fuse");
          break;
        case "explode":
          bursts.current.push(makeBurst([event.x, event.y, event.z], "#3a2a1a", true));
          playSound("boom");
          cratesChanged = true;
          break;
        case "fruit":
          playSound("fruit", { intensity: (event.total % 10) / 9 });
          break;
        case "mask":
          playSound("mask");
          break;
        case "maskLost":
          playSound("hurt");
          break;
        case "checkpoint":
          playSound("checkpoint");
          break;
        case "enemy":
          deadAt.current[event.index] = state.clock.elapsedTime;
          playSound(event.stomped ? "boing" : "slash");
          break;
        case "crystal":
          playSound("crystal");
          break;
        case "gem":
          playSound("gem");
          break;
        case "death":
          l.frozen = true;
          playSound(event.cause === "fall" ? "fall" : "whoa");
          if (event.cause === "explosion" || event.cause === "boulder") playSound("hurt");
          break;
        case "respawn":
          teleport.current = event.position;
          l.frozen = false;
          l.spinTime = 0;
          deadAt.current = deadAt.current.map((t, i) => (current.enemyDead[i] ? t : -1));
          break;
        case "boulder":
          playSound(event.state === "rolling" ? "rumble" : "bossImpact");
          break;
      }
    }
    if (cratesChanged) setCrateVersion((v) => v + 1);
    if (events.length) onEvents(events);

    // Critters: patrol, or tumble away once beaten.
    const time = current.time;
    level.enemies.forEach((enemy, i) => {
      const group = critters.current[i];
      if (!group) return;
      const at = enemyPosition(enemy, time);
      if (current.enemyDead[i]) {
        const since = state.clock.elapsedTime - deadAt.current[i];
        if (deadAt.current[i] < 0 || since > 1.2) {
          group.visible = false;
          return;
        }
        group.position.y = enemy.y + since * 6 - since * since * 9;
        group.position.z -= dt * 5;
        group.rotation.x += dt * 14;
        return;
      }
      group.visible = true;
      const bob = Math.abs(Math.sin(time * enemy.speed * 4)) * 0.08;
      group.position.set(at.x, enemy.y + bob, at.z);
      const along = enemy.axis === "x" ? Math.PI / 2 : 0;
      group.rotation.set(0, along + (at.heading < 0 ? Math.PI : 0), 0);
    });

    // The boulder.
    const rock = boulder.current;
    if (rock && level.boulder) {
      rock.position.z = current.boulder.z;
      rock.rotation.x = -(current.boulder.z - level.boulder.startZ) / level.boulder.radius;
      if (current.boulder.active && !current.boulder.stopped) {
        rumble.current -= dt;
        if (rumble.current <= 0) {
          rumble.current = 0.9;
          playSound("rumble");
        }
      }
    }
  });

  const setCritter = useCallback(
    (index: number) => (group: THREE.Group | null) => {
      critters.current[index] = group;
    },
    [],
  );
  const exitPortals = useMemo(
    () => [{ id: "exit", position: level.exit, yaw: 0, scale: 1 }],
    [level.exit],
  );
  const current = run.current;

  return (
    <>
      <color attach="background" args={[theme.sky]} />
      <fog attach="fog" args={[theme.sky, theme.fog[0], theme.fog[1]]} />
      <hemisphereLight args={[theme.hemi[0], theme.hemi[1], 1.5]} />
      <FollowSun link={link} color={theme.light} intensity={theme.sun} />

      <RigidBody type="fixed" colliders={false}>
        {level.solids.map((solid, i) => {
          const bottom = solid.bottom ?? -16;
          const height = solid.top - bottom;
          return (
            <CuboidCollider
              key={i}
              args={[solid.w / 2, height / 2, solid.d / 2]}
              position={[solid.x, bottom + height / 2, solid.z]}
            />
          );
        })}
      </RigidBody>
      <LevelGround level={level} />
      <LevelDressing level={level} />

      <PlatformSystem />
      {level.movers.map((mover, i) => (
        <KinematicPlatform
          key={i}
          position={[mover.x, mover.top - 0.2, mover.z]}
          axis={mover.axis}
          distance={mover.distance}
          speed={mover.speed}
          phase={mover.phase ?? 0}
          size={[mover.w, 0.4, mover.d]}
          color={theme.deco === "snow" ? "#bfe3f5" : theme.trim}
        />
      ))}

      {level.crates.map((crate, i) =>
        current.crates[i].broken ? null : (
          <RigidBody key={i} type="fixed" colliders={false} position={[crate.x, crate.y, crate.z]}>
            <CuboidCollider
              args={[CRATE_SIZE / 2, CRATE_SIZE / 2, CRATE_SIZE / 2]}
              position={[0, CRATE_SIZE / 2, 0]}
            />
            <CrateMesh
              kind={crate.kind}
              squash={() => run.current.crates[i].squash}
              fuse={() => run.current.crates[i].fuse}
            />
          </RigidBody>
        ),
      )}
      <Debris bursts={bursts} />
      <FruitField fruit={level.fruit} taken={() => run.current.fruitTaken} />
      <PowerCrystal position={level.crystal} collected={() => run.current.crystal} />

      {level.enemies.map((enemy, i) => (
        <group key={i} ref={setCritter(i)} position={[enemy.x, enemy.y, enemy.z]}>
          <Critter kind={enemy.kind} color={theme.enemy} spiky={enemy.spiky} />
        </group>
      ))}

      {level.boulder && (
        <group position={[0, level.boulder.radius, level.boulder.startZ]} ref={boulder}>
          <mesh castShadow>
            <icosahedronGeometry args={[level.boulder.radius, 1]} />
            <meshStandardMaterial color="#8a6a4f" roughness={1} flatShading />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[level.boulder.radius * 0.98, 0.12, 6, 18]} />
            <meshStandardMaterial color="#6b4f38" roughness={1} flatShading />
          </mesh>
        </group>
      )}

      <group position={level.exit}>
        <PortalPainting
          image="/assets/pocket_monsters.jpg"
          position={[0, 2.17, 0]}
          variant="warp"
          active={nearExit}
        />
        <PortalFrameCollider position={[0, 2.17, 0]} />
      </group>

      <AkuMask follow={link} masks={() => run.current.masks} />
      <ThirdPersonPlayer
        start={level.spawn}
        platformer={link}
        teleportRef={teleport}
        portals={exitPortals}
        bounds={[40, 140]}
        cameraDistance={7}
        onNearPortal={(id) => onNearExit(Boolean(id))}
        onEnterPortal={onExit}
        onHangChange={() => {}}
        onReady={onReady}
      />
    </>
  );
}
