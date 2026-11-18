import type { RigidBody, Collider } from "@dimforge/rapier3d-compat";
import type { BodyComponent, ColliderComponent } from "./sceneComponents.ts";
/** Shared by native prefab overrides and tested against live Rapier bodies. */
export function configureBody(body: RigidBody, settings: BodyComponent) {
  body.setGravityScale(settings.gravityScale, true);
  body.setLinearDamping(settings.linearDamping);
  body.setAngularDamping(settings.angularDamping);
  body.enableCcd(settings.ccd);
  body.setEnabledTranslations(
    !settings.freezePosition[0],
    !settings.freezePosition[1],
    !settings.freezePosition[2],
    true,
  );
  body.setEnabledRotations(
    !settings.freezeRotation[0],
    !settings.freezeRotation[1],
    !settings.freezeRotation[2],
    true,
  );
  for (let i = 0; i < body.numColliders(); i++)
    body.collider(i).setMass(settings.mass / Math.max(1, body.numColliders()));
  body.setAdditionalMass(body.numColliders() ? 0 : settings.mass, true);
  body.recomputeMassPropertiesFromColliders();
}
export function configureCollider(collider: Collider, settings: ColliderComponent | null) {
  collider.setEnabled(Boolean(settings?.enabled));
  if (settings) {
    collider.setFriction(settings.friction);
    collider.setRestitution(settings.restitution);
    collider.setSensor(settings.sensor);
  }
}
