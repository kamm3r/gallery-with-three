import { configureBody, configureCollider } from "../gameplay/scenePhysics";
import { useContext, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { Quaternion, Euler } from "three";
import { SceneDocumentContext, sceneObjectOwner } from "./SceneObject";
import { effectiveProperties } from "../gameplay/sceneComponentCommands";
import { bodyDefaults, colliderDefaults, editableTemplate } from "../gameplay/sceneComponents";
/** Overrides source-owned bodies without replacing their gameplay component. */
export function ScenePhysicsOverrides() {
  const document = useContext(SceneDocumentContext);
  const { rigidBodyStates, rapier } = useRapier();
  const seen = useRef(new WeakMap<object, { document: typeof document; count: number }>());
  useFrame(() => {
    for (const state of rigidBodyStates.values()) {
      const owner = sceneObjectOwner(state.object);
      if (!owner) continue;
      const id = owner.userData.sceneObjectId as string;
      if (document.nodes[id] && editableTemplate(document.nodes[id].template)) continue;
      const rb = state.rigidBody;
      const previous = seen.current.get(rb),
        count = rb.numColliders();
      if (previous?.document === document && previous.count === count) continue;
      seen.current.set(rb, { document, count });
      const c = effectiveProperties(document, id).components;
      const first = rb.numColliders() ? rb.collider(0) : null;
      if (
        !owner.userData.scenePhysicsDefaults ||
        (!owner.userData.scenePhysicsDefaults.collider && first)
      ) {
        owner.userData.sceneMotionOwned = rb.isKinematic();
        owner.userData.scenePhysicsDefaults = {
          rigidbody: rb.isFixed()
            ? null
            : {
                ...bodyDefaults(),
                type: rb.isKinematic() ? "kinematic" : "dynamic",
                mass: Math.max(0.001, rb.mass()),
                gravityScale: rb.gravityScale(),
                linearDamping: rb.linearDamping(),
                angularDamping: rb.angularDamping(),
                ccd: rb.isCcdEnabled(),
              },
          collider: first
            ? {
                ...colliderDefaults(),
                friction: first.friction(),
                restitution: first.restitution(),
                sensor: first.isSensor(),
              }
            : null,
        };
        if (typeof window !== "undefined")
          window.dispatchEvent(new CustomEvent("scene-view:document"));
      }
      if (c?.rigidbody !== undefined) {
        const b = c.rigidbody;
        rb.setBodyType(
          !b?.enabled || b.type === "fixed"
            ? rapier.RigidBodyType.Fixed
            : b.type === "dynamic"
              ? rapier.RigidBodyType.Dynamic
              : rapier.RigidBodyType.KinematicPositionBased,
          true,
        );
        if (b?.enabled) {
          configureBody(rb, b);
        }
      }
      for (let i = 0; i < rb.numColliders(); i++) {
        const collider = rb.collider(i),
          config = c?.collider;
        if (config !== undefined) {
          configureCollider(collider, config);
          if (config) {
            // Compound source prefabs retain their authored geometry. Explicit shapes are supported on single-collider nodes.
            if (rb.numColliders() === 1 && config.shape !== "auto") {
              const scale = state.scale;
              const shape =
                config.shape === "box"
                  ? new rapier.Cuboid(
                      (config.size[0] * scale.x) / 2,
                      (config.size[1] * scale.y) / 2,
                      (config.size[2] * scale.z) / 2,
                    )
                  : config.shape === "sphere"
                    ? new rapier.Ball(config.radius * Math.max(scale.x, scale.y, scale.z))
                    : new rapier.Capsule(
                        Math.max(0, config.height / 2 - config.radius) * scale.y,
                        config.radius * Math.max(scale.x, scale.z),
                      );
              collider.setShape(shape);
              collider.setTranslationWrtParent({
                x: config.center[0] * scale.x,
                y: config.center[1] * scale.y,
                z: config.center[2] * scale.z,
              });
              collider.setRotationWrtParent(
                new Quaternion().setFromEuler(new Euler(...config.rotation)),
              );
            }
          }
        }
        if (c?.rigidbody?.enabled)
          collider.setMass(c.rigidbody.mass / Math.max(1, rb.numColliders()));
      }
      owner.userData.sceneColliderCount = rb.numColliders();
      if (c?.rigidbody?.enabled && !rb.numColliders()) rb.setAdditionalMass(c.rigidbody.mass, true);
      rb.recomputeMassPropertiesFromColliders();
    }
  });
  return null;
}
