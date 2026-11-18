import { useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { CapsuleCollider, RigidBody } from "@react-three/rapier";
import { LinearFilter, NearestFilter, SRGBColorSpace, TextureLoader } from "three";
import { gothicResidents, type Resident } from "../gameplay/gothicResidents";
import { createWayfarer } from "../gameplay/wayfarer";
import { SceneObject } from "./SceneObject";
import { useGame } from "../hooks/useGame";
import { editorFrameDelta, getEditorPlayback } from "../dev/editorPlayback";
import { isPlaygroundEditor } from "../gameplay/editorMode";

export function WayfarerNpc({ resident }: { resident?: Resident }) {
  const placement = resident ? gothicResidents[resident] : undefined;
  const height = placement?.height ?? 1.72;
  const radius = placement?.radius ?? 0.25;
  const atlas = useLoader(
    TextureLoader,
    resident
      ? "/assets/characters/wayfarer/residents-atlas.png"
      : "/assets/characters/wayfarer/wayfarer-atlas.png",
  );
  const rig = useMemo(() => {
    atlas.colorSpace = SRGBColorSpace;
    atlas.magFilter = atlas.minFilter = resident ? LinearFilter : NearestFilter;
    atlas.generateMipmaps = false;
    return createWayfarer(atlas, resident);
  }, [atlas, resident]);
  const headPitch = useMemo(() => rig.joints.head.rotation.x, [rig]);
  const { paused, settings } = useGame();
  const time = useRef(0);
  useEffect(() => () => rig.dispose(), [rig]);
  useFrame((_, delta) => {
    const editing = isPlaygroundEditor(window.location.pathname, window.location.search);
    if (paused || (editing && !getEditorPlayback())) return;
    time.current += editorFrameDelta(Math.min(delta, 0.05));
    const t = time.current + (placement?.yaw ?? 0) * 7;
    const motion = settings.reducedMotion ? 0 : 1;
    rig.joints.body.position.y = Math.sin(t * 1.8) * 0.004 * motion;
    rig.joints.head.rotation.y = Math.sin(t * 0.43) * (resident === "gaoler" ? 0.1 : 0.22) * motion;
    rig.joints.head.rotation.x = headPitch + Math.sin(t * 0.71) * 0.035 * motion;
    for (const side of [-1, 1]) {
      const swing = resident === "mourner" ? 0.004 : resident ? 0.013 : 0.025;
      const rest = resident ? 0 : 0.06;
      rig.joints[`arm${side}`].rotation.x = (rest + Math.sin(t * 1.8 + side) * swing) * motion;
    }
    rig.joints.scarf.rotation.x = Math.sin(t * 2.1) * 0.05 * motion;
  });
  return (
    <SceneObject
      id={`npc-${resident ?? "wayfarer"}`}
      name={placement?.name ?? "Wayfarer · PS2 NPC"}
      position={placement?.position ?? [3, 0, 21]}
      rotation={[0, placement?.yaw ?? 0, 0]}
    >
      <RigidBody type="fixed" colliders={false}>
        <CapsuleCollider
          args={[height / 2 - radius, radius]}
          position={[0, height / 2 + 0.02, 0]}
        />
        <primitive object={rig.root} />
      </RigidBody>
    </SceneObject>
  );
}
