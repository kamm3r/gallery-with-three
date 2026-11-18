import { WayfarerNpc } from "./WayfarerNpc";
import { ScenePhysicsOverrides } from "./ScenePhysicsOverrides";
import { WORLD_ROOT_ID } from "../gameplay/sceneDocument";
import { CreatedSceneObjects } from "./CreatedSceneObjects";
import { memo } from "react";
import { SceneObject } from "./SceneObject";
import { Sky } from "@react-three/drei";
import { CollisionCourse } from "./CollisionCourse";
import { CustomTreeShowcase } from "./CustomTreeShowcase";
import { PlatformSystem } from "./KinematicPlatform";

/** Shared scenery for the playable proving grounds and browser inspector. */
export const PlaygroundScene = memo(function PlaygroundScene({
  batchStatic = false,
}: {
  /** Play mode merges fixed obstacles into batches; the editor keeps them separate. */
  batchStatic?: boolean;
}) {
  return (
    <>
      <ScenePhysicsOverrides />
      <color attach="background" args={["#b9cad3"]} />
      <fog attach="fog" args={["#b9cad3", 95, 190]} />
      <Sky distance={450000} sunPosition={[5, 7, 3]} turbidity={5} rayleigh={2} />
      <hemisphereLight args={["#edf4f0", "#3a4650", 1.7]} />
      <SceneObject id={WORLD_ROOT_ID} name="World3D">
        <SceneObject
          id="camera-main"
          name="Main Camera"
          position={[0, 8, 22]}
          rotation={[-0.3, 0, 0]}
        >
          <perspectiveCamera fov={60} near={0.1} far={500} aspect={16 / 9} />
        </SceneObject>
        <SceneObject id="light-sun" name="Sun" position={[-24, 55, 30]}>
          <directionalLight
            castShadow
            color="#fff0ce"
            intensity={2.3}
            position={[0, 0, 0]}
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-left={-85}
            shadow-camera-right={85}
            shadow-camera-top={85}
            shadow-camera-bottom={-85}
            shadow-camera-near={0.5}
            shadow-camera-far={200}
            shadow-normalBias={0.025}
          />
        </SceneObject>
        <CreatedSceneObjects />
        <CollisionCourse batchStatic={batchStatic} />
        <CustomTreeShowcase />
        <WayfarerNpc />
        <WayfarerNpc resident="gravedigger" />
        <WayfarerNpc resident="mourner" />
        <WayfarerNpc resident="gaoler" />
        <WayfarerNpc resident="apothecary" />
        <PlatformSystem />
      </SceneObject>
    </>
  );
});
