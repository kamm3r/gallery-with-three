import type { ScriptValue, Vec3 } from "./sceneComponents.ts";
export type SceneBehavior = {
  name: string;
  fields: Record<string, ScriptValue>;
  update: (context: {
    time: number;
    delta: number;
    fields: Record<string, ScriptValue>;
    position: Vec3;
    rotation: Vec3;
  }) => void;
};
