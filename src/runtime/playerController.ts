import type RAPIER from "@dimforge/rapier3d-compat";
import { createCharacterMotor, type CharacterMotorOptions } from "./characterMotor.ts";
import type { PlayerBodyData } from "../gameplay/playerBody.ts";

type PlayerControllerOptions = Omit<CharacterMotorOptions, "body" | "collider" | "rapier"> & {
  rapier: typeof RAPIER;
  position: readonly [number, number, number];
  yaw?: number;
};

/** Native ownership of the player body, capsule, controller and ECS state. */
export function createPlayerController(options: PlayerControllerOptions) {
  const { world, rapier, position, yaw = 0 } = options;
  const body = world.createRigidBody(
    rapier.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(...position)
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .setCanSleep(false),
  );
  const collider = world.createCollider(
    rapier.ColliderDesc.capsule(
      options.capsuleHalfHeight,
      options.capsuleRadius,
    ).setActiveCollisionTypes(
      rapier.ActiveCollisionTypes.DEFAULT |
        rapier.ActiveCollisionTypes.KINEMATIC_FIXED |
        rapier.ActiveCollisionTypes.KINEMATIC_KINEMATIC,
    ),
    body,
  );
  const motor = createCharacterMotor({ ...options, body: () => body, collider: () => collider });
  body.userData = { player: true, launch: motor.handle.launch } satisfies PlayerBodyData;
  const unmount = motor.mount();
  motor.handle.body = body;
  let disposed = false;
  return {
    body,
    collider,
    handle: motor.handle,
    step() {
      if (!disposed) motor.step();
    },
    configure: motor.configure,
    dispose() {
      if (disposed) return;
      disposed = true;
      unmount();
      if (body.isValid()) world.removeRigidBody(body);
    },
  };
}
