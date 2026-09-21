import { trait } from 'koota';
import type { InstancedMesh, Object3D } from 'three';

export const PlayerPosition = trait({ x: 1000, y: 1000, z: 1000, valid: false });
export const PlayerView = trait(() => ({ object: null as Object3D | null }));
export const SimulationTime = trait({ elapsed: 0 });

export interface InstancePoint { x: number; y: number; z: number; scale: number; rotation: number }
export interface BatchData {
  points: InstancePoint[];
  matrices: Float32Array;
  levels: Uint8Array;
  detail: InstancedMesh[];
  proxy: InstancedMesh[];
  radius: number;
  centerY: number;
  near: number;
  far: number;
  shadows: boolean;
}
export const InstanceBatch = trait(() => ({} as BatchData));
export const VisibilityStats = trait({ detailed: 0, simplified: 0, culled: 0 });

// A structural adapter keeps the simulation independent of React/Rapier hooks.
export interface KinematicBody {
  setNextKinematicTranslation: (position: { x: number; y: number; z: number }) => void;
  setNextKinematicRotation: (rotation: { x: number; y: number; z: number; w: number }) => void;
}
export const PlatformBody = trait(() => ({ body: null as KinematicBody | null }));
export const PlatformMotion = trait({ x: 0, y: 0, z: 0, axis: 'x', distance: 0, speed: 1, phase: 0, spin: 0 });
