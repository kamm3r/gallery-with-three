export type Vec3 = [number, number, number];
export type BodyComponent = {
  enabled: boolean;
  type: "fixed" | "dynamic" | "kinematic";
  mass: number;
  gravityScale: number;
  linearDamping: number;
  angularDamping: number;
  freezePosition: [boolean, boolean, boolean];
  freezeRotation: [boolean, boolean, boolean];
  ccd: boolean;
};
export type ColliderComponent = {
  enabled: boolean;
  shape: "auto" | "box" | "sphere" | "capsule";
  center: Vec3;
  rotation: Vec3;
  size: Vec3;
  radius: number;
  height: number;
  friction: number;
  restitution: number;
  sensor: boolean;
};
export type RendererComponent = { enabled: boolean };
export type AnimationComponent = {
  enabled: boolean;
  clip: string;
  autoplay: boolean;
  speed: number;
  loop: boolean;
};
export type ScriptValue = number | boolean | string | Vec3;
export type ScriptComponent = {
  id: string;
  script: string;
  enabled: boolean;
  fields: Record<string, ScriptValue>;
};
export type ComponentOverrides = {
  renderer?: RendererComponent | null;
  rigidbody?: BodyComponent | null;
  collider?: ColliderComponent | null;
  animation?: AnimationComponent | null;
  scripts?: ScriptComponent[];
};
export type ComponentKind = "renderer" | "rigidbody" | "collider" | "animation";
export type SceneMaterial = {
  name: string;
  color: string;
  roughness: number;
  metalness: number;
  opacity: number;
  emissive: string;
  emissiveIntensity: number;
  doubleSided: boolean;
  map?: string | null;
  normalMap?: string | null;
  roughnessMap?: string | null;
  metalnessMap?: string | null;
  emissiveMap?: string | null;
  normalScale: number;
  tiling: [number, number];
  offset: [number, number];
};
export const bodyDefaults = (): BodyComponent => ({
  enabled: true,
  type: "dynamic",
  mass: 1,
  gravityScale: 1,
  linearDamping: 0,
  angularDamping: 0.05,
  freezePosition: [false, false, false],
  freezeRotation: [false, false, false],
  ccd: false,
});
export const colliderDefaults = (): ColliderComponent => ({
  enabled: true,
  shape: "auto",
  center: [0, 0, 0],
  rotation: [0, 0, 0],
  size: [1, 1, 1],
  radius: 0.5,
  height: 2,
  friction: 0.8,
  restitution: 0,
  sensor: false,
});
export const materialDefaults = (name = "Material"): SceneMaterial => ({
  name,
  color: "#a8b5c9",
  roughness: 0.75,
  metalness: 0,
  opacity: 1,
  emissive: "#000000",
  emissiveIntensity: 0,
  doubleSided: false,
  normalScale: 1,
  tiling: [1, 1],
  offset: [0, 0],
});
export const animationDefaults = (): AnimationComponent => ({
  enabled: true,
  clip: "",
  autoplay: true,
  speed: 1,
  loop: true,
});
export function editableTemplate(template: string) {
  return (
    template.startsWith("primitive-") || template === "asset-model" || template === "empty-node"
  );
}
export function defaultComponents(node?: {
  template: string;
  dynamic?: boolean;
  componentized?: boolean;
}): ComponentOverrides {
  if (!node || node.componentized || node.template === "empty-node") return {};
  return node.template.startsWith("primitive-")
    ? {
        renderer: { enabled: true },
        rigidbody: { ...bodyDefaults(), type: node.dynamic ? "dynamic" : "fixed" },
        collider: colliderDefaults(),
      }
    : node.template === "asset-model"
      ? { renderer: { enabled: true }, collider: colliderDefaults() }
      : {};
}
export function safeField(key: string) {
  return (
    /^[a-zA-Z0-9:_-]{1,160}$/.test(key) && !["__proto__", "constructor", "prototype"].includes(key)
  );
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid component data");
  return value as Record<string, unknown>;
}
function number(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    throw new Error(`Number must be between ${min} and ${max}`);
  return value;
}
function bool(value: unknown) {
  if (typeof value !== "boolean") throw new Error("Expected a boolean");
  return value;
}
function vector(value: unknown, length: number, min: number, max: number) {
  if (!Array.isArray(value) || value.length !== length) throw new Error("Invalid component vector");
  return value.map((n) => number(n, min, max));
}
function axisFlags(value: unknown): [boolean, boolean, boolean] {
  if (!Array.isArray(value) || value.length !== 3) throw new Error("Invalid axis locks");
  return value.map(bool) as [boolean, boolean, boolean];
}
function color(value: unknown) {
  if (typeof value !== "string" || !/^#[\da-f]{6}$/i.test(value))
    throw new Error("Invalid material color");
  return value;
}
function invalidTextureChars(value: string) {
  for (let i = 0; i < value.length; i++) if (value.charCodeAt(i) < 32) return true;
  return /[?#\\]/.test(value);
}
export function validTextureAsset(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 1024 ||
    !value.startsWith("/assets/") ||
    !/\.(png|jpe?g|webp|avif)$/i.test(value) ||
    invalidTextureChars(value)
  )
    return false;
  try {
    return (
      !decodeURIComponent(value)
        .split("/")
        .some((part) => part === "." || part === "..") &&
      !invalidTextureChars(decodeURIComponent(value))
    );
  } catch {
    return false;
  }
}
export function validateMaterial(value: unknown): SceneMaterial {
  const r = record(value);
  if (typeof r.name !== "string" || !r.name.trim() || r.name.length > 120)
    throw new Error("Invalid material name");
  const result: SceneMaterial = {
    name: r.name,
    color: color(r.color),
    roughness: number(r.roughness, 0, 1),
    metalness: number(r.metalness, 0, 1),
    opacity: number(r.opacity, 0, 1),
    emissive: color(r.emissive),
    emissiveIntensity: number(r.emissiveIntensity, 0, 100),
    doubleSided: bool(r.doubleSided),
    normalScale: number(r.normalScale, 0, 10),
    tiling: vector(r.tiling, 2, 0.001, 1000) as [number, number],
    offset: vector(r.offset, 2, -1000, 1000) as [number, number],
  };
  for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap"] as const) {
    if (r[key] === undefined) continue;
    if (r[key] !== null && !validTextureAsset(r[key]))
      throw new Error("Textures must reference local image assets");
    result[key] = r[key] as string | null;
  }
  return result;
}
export function validateComponents(value: unknown): ComponentOverrides {
  const r = record(value);
  const result: ComponentOverrides = {};
  for (const key of ["renderer", "rigidbody", "collider", "animation"] as const)
    if (r[key] === null) result[key] = null;
  if (r.renderer != null) result.renderer = { enabled: bool(record(r.renderer).enabled) };
  if (r.rigidbody != null) {
    const c = record(r.rigidbody);
    if (!["fixed", "dynamic", "kinematic"].includes(String(c.type)))
      throw new Error("Invalid rigid body type");
    result.rigidbody = {
      enabled: bool(c.enabled),
      type: c.type as BodyComponent["type"],
      mass: number(c.mass, 0.001, 100000),
      gravityScale: number(c.gravityScale, -100, 100),
      linearDamping: number(c.linearDamping, 0, 100),
      angularDamping: number(c.angularDamping, 0, 100),
      freezePosition: axisFlags(c.freezePosition),
      freezeRotation: axisFlags(c.freezeRotation),
      ccd: bool(c.ccd),
    };
  }
  if (r.collider != null) {
    const c = record(r.collider);
    if (!["auto", "box", "sphere", "capsule"].includes(String(c.shape)))
      throw new Error("Invalid collider shape");
    result.collider = {
      enabled: bool(c.enabled),
      shape: c.shape as ColliderComponent["shape"],
      center: vector(c.center, 3, -10000, 10000) as Vec3,
      rotation: vector(c.rotation, 3, -10000, 10000) as Vec3,
      size: vector(c.size, 3, 0.001, 10000) as Vec3,
      radius: number(c.radius, 0.001, 10000),
      height: number(c.height, 0.002, 10000),
      friction: number(c.friction, 0, 10),
      restitution: number(c.restitution, 0, 1),
      sensor: bool(c.sensor),
    };
  }
  if (r.animation != null) {
    const c = record(r.animation);
    if (typeof c.clip !== "string" || c.clip.length > 240)
      throw new Error("Invalid animation clip");
    result.animation = {
      enabled: bool(c.enabled),
      clip: c.clip,
      autoplay: bool(c.autoplay),
      speed: number(c.speed, 0, 10),
      loop: bool(c.loop),
    };
  }
  if (r.scripts !== undefined) {
    if (!Array.isArray(r.scripts) || r.scripts.length > 16) throw new Error("Too many scripts");
    const ids = new Set<string>();
    result.scripts = r.scripts.map((value) => {
      const s = record(value);
      if (
        typeof s.id !== "string" ||
        !safeField(s.id) ||
        ids.has(s.id) ||
        typeof s.script !== "string" ||
        !safeField(s.script)
      )
        throw new Error("Invalid script reference");
      ids.add(s.id);
      const fields = record(s.fields);
      if (Object.keys(fields).length > 32) throw new Error("Too many script fields");
      const parsed: Record<string, ScriptValue> = {};
      for (const [key, field] of Object.entries(fields)) {
        if (!safeField(key)) throw new Error("Invalid script field");
        if (typeof field === "boolean" || (typeof field === "string" && field.length <= 512))
          parsed[key] = field;
        else if (typeof field === "number") parsed[key] = number(field, -100000, 100000);
        else parsed[key] = vector(field, 3, -100000, 100000) as Vec3;
      }
      return { id: s.id, script: s.script, enabled: bool(s.enabled), fields: parsed };
    });
  }
  return result;
}
