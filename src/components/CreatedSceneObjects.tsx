import { useFrame } from "@react-three/fiber";
import { configureBody } from "../gameplay/scenePhysics";
import { useGLTF } from "@react-three/drei";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { Component, Suspense, useContext, useMemo, useRef, type ReactNode } from "react";
import {
  BallCollider,
  CapsuleCollider,
  ConvexHullCollider,
  CuboidCollider,
  MeshCollider,
  RigidBody,
  type RapierRigidBody,
} from "@react-three/rapier";
import { AuthoredSceneNode, SceneDocumentContext } from "./SceneObject";
import type { SceneNode, SceneProperties } from "../gameplay/sceneDocument";
import { Group, type Mesh, type BufferGeometry } from "three";
import { playgroundMaterial, unitGeometry } from "../gameplay/playgroundResources";
import { editableTemplate } from "../gameplay/sceneComponents";
import { effectiveProperties } from "../gameplay/sceneComponentCommands";
import { SceneAnimation, SceneBehaviors } from "./SceneAnimation";

function ManagedObject({
  node,
  settings,
  children,
  geometry,
}: {
  node: SceneNode;
  settings: SceneProperties;
  children: ReactNode;
  geometry?: BufferGeometry;
}) {
  const c = settings.components ?? {};
  const body = c.rigidbody?.enabled ? c.rigidbody : null;
  const collider = c.collider?.enabled ? c.collider : null;
  const behaviorRoot = useMemo(() => new Group(), []);
  const rigid = useRef<RapierRigidBody>(null);
  const scripts = c.scripts ?? [];
  const configured = useRef<{ rb: RapierRigidBody; count: number; settings: typeof body } | null>(
    null,
  );
  useFrame(() => {
    const rb = rigid.current;
    if (!rb || !body) return;
    const count = rb.numColliders(),
      before = configured.current;
    if (before?.rb === rb && before.count === count && before.settings === body) return;
    configureBody(rb, body);
    configured.current = { rb, count, settings: body };
  }, -1);
  const colliderProps = collider
    ? {
        position: collider.center,
        rotation: collider.rotation,
        friction: collider.friction,
        restitution: collider.restitution,
        sensor: collider.sensor,
        mass: body?.mass ?? 1,
      }
    : {};
  const content = (
    <>
      <primitive object={behaviorRoot}>{children}</primitive>
      {scripts.length > 0 && (
        <SceneBehaviors object={behaviorRoot} scripts={scripts} body={rigid} />
      )}
      {collider &&
        (collider.shape === "box" ? (
          <CuboidCollider
            {...colliderProps}
            args={[collider.size[0] / 2, collider.size[1] / 2, collider.size[2] / 2]}
          />
        ) : collider.shape === "sphere" ? (
          <BallCollider {...colliderProps} args={[collider.radius]} />
        ) : collider.shape === "capsule" ? (
          <CapsuleCollider
            {...colliderProps}
            args={[Math.max(0, collider.height / 2 - collider.radius), collider.radius]}
          />
        ) : geometry ? (
          node.template === "primitive-box" ? (
            <CuboidCollider {...colliderProps} args={[0.5, 0.5, 0.5]} />
          ) : (
            <ConvexHullCollider
              {...colliderProps}
              args={[geometry.getAttribute("position").array as Float32Array]}
            />
          )
        ) : null)}
    </>
  );
  if (!body && !collider) return content;
  const hasScripts = scripts.some((s) => s.enabled);
  return (
    <RigidBody
      ref={rigid}
      type={
        hasScripts
          ? "kinematicPosition"
          : body?.type === "kinematic"
            ? "kinematicPosition"
            : (body?.type ?? "fixed")
      }
      colliders={false}
      gravityScale={body?.gravityScale ?? 1}
      linearDamping={body?.linearDamping ?? 0}
      angularDamping={body?.angularDamping ?? 0}
      enabledTranslations={
        body?.freezePosition.map((v) => !v) as [boolean, boolean, boolean] | undefined
      }
      enabledRotations={
        body?.freezeRotation.map((v) => !v) as [boolean, boolean, boolean] | undefined
      }
      ccd={body?.ccd ?? false}
      friction={collider?.friction}
      restitution={collider?.restitution}
      sensor={collider?.sensor}
    >
      {collider?.shape === "auto" && !geometry ? (
        <MeshCollider type={body?.type === "dynamic" ? "hull" : "trimesh"}>{content}</MeshCollider>
      ) : (
        content
      )}
    </RigidBody>
  );
}
function Primitive({ node, settings }: { node: SceneNode; settings: SceneProperties }) {
  const geometry =
    node.template === "primitive-sphere"
      ? unitGeometry.sphere
      : node.template === "primitive-cylinder"
        ? unitGeometry.cylinder
        : node.template === "primitive-cone"
          ? unitGeometry.cone
          : unitGeometry.box;
  const color = node.color ?? "#a8b5c9";
  return (
    <ManagedObject node={node} settings={settings} geometry={geometry}>
      <mesh
        name={`${node.template}-mesh`}
        geometry={geometry}
        material={playgroundMaterial(`Primitive ${color}`, color, { roughness: 0.75 })}
        castShadow
        receiveShadow
        dispose={null}
      />
    </ManagedObject>
  );
}
class ModelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <group userData={{ assetLoadError: true }}>
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#d66a78" wireframe />
        </mesh>
      </group>
    ) : (
      this.props.children
    );
  }
}
function AssetModel({ node, settings }: { node: SceneNode; settings: SceneProperties }) {
  const model = useGLTF(node.assetUrl!);
  const instance = useMemo(() => {
    const object = clone(model.scene);
    object.traverse((child) => {
      if ((child as Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return object;
  }, [model.scene]);
  return (
    <ManagedObject node={node} settings={settings}>
      <primitive object={instance} dispose={null} />
      <SceneAnimation
        object={instance}
        clips={model.animations}
        settings={settings.components?.animation}
      />
    </ManagedObject>
  );
}
export function CreatedSceneObjects() {
  const document = useContext(SceneDocumentContext);
  return (
    <>
      {Object.entries(document.nodes)
        .filter(([, node]) => editableTemplate(node.template))
        .map(([id, node]) => {
          const settings = effectiveProperties(document, id);
          return (
            <AuthoredSceneNode
              key={id}
              id={id}
              name={node.name}
              transform={document.objects[id]}
              definition={node}
            >
              {node.template === "asset-model" && node.assetUrl ? (
                <ModelBoundary key={node.assetUrl}>
                  <Suspense fallback={null}>
                    <AssetModel node={node} settings={settings} />
                  </Suspense>
                </ModelBoundary>
              ) : node.template === "empty-node" ? (
                <ManagedObject node={node} settings={settings}>
                  {null}
                </ManagedObject>
              ) : (
                <Primitive node={node} settings={settings} />
              )}
            </AuthoredSceneNode>
          );
        })}
    </>
  );
}
