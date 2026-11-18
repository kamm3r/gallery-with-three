import { useEffect, useState } from "react";
import type { Object3D, Mesh, MeshStandardMaterial } from "three";
import { sceneObjectOwner } from "../components/SceneObject";
import {
  validTextureAsset,
  animationDefaults,
  bodyDefaults,
  colliderDefaults,
  materialDefaults,
  type ComponentKind,
  type ComponentOverrides,
  type SceneMaterial,
  type ScriptComponent,
} from "../gameplay/sceneComponents";
import type { SceneDocument, SceneNode, SceneProperties } from "../gameplay/sceneDocument";
import { sceneBehaviors } from "../gameplay/sceneBehaviors";
import {
  ComponentSection,
  PropertyRow,
  NumberInput,
  ToggleField,
  VectorRow,
  ColorField,
} from "./SceneInspector";
import type { AssetEntry } from "./assetTypes";
export type ComponentCommand =
  | { type: "components"; id: string; patch: ComponentOverrides }
  | { type: "apply-prefab"; id: string }
  | { type: "material-create"; id: string; material: SceneMaterial }
  | { type: "material-update"; id: string; materialId: string; material: SceneMaterial }
  | { type: "material-assign"; id: string; materialId: string }
  | { type: "component-reset"; id: string; kind: ComponentKind };
function command(detail: ComponentCommand) {
  window.dispatchEvent(new CustomEvent("scene-view:component-command", { detail }));
}
let clipboard: { kind: ComponentKind; value: unknown } | null = null;
const labels = {
  renderer: "Mesh Renderer",
  rigidbody: "Rigidbody",
  collider: "Collider",
  animation: "Animation",
};
const defaults = {
  renderer: () => ({ enabled: true }),
  rigidbody: bodyDefaults,
  collider: colliderDefaults,
  animation: animationDefaults,
};
function AssetPicker({
  value,
  kind,
  onChange,
}: {
  value: string;
  kind: "image" | "model";
  onChange: (url: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [folder, setFolder] = useState(""),
    [entries, setEntries] = useState<AssetEntry[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setError("");
    void fetch(`/__editor/assets?folder=${encodeURIComponent(folder)}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw Error("Could not load assets");
        return r.json();
      })
      .then((data) => setEntries(data.entries ?? []))
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      });
    return () => controller.abort();
  }, [open, folder]);
  return (
    <div className="component-asset-picker">
      <button title={value || "Choose asset"} onClick={() => setOpen((v) => !v)}>
        {value ? decodeURIComponent(value.split("/").at(-1) ?? value) : "None"} ◉
      </button>
      {open && (
        <div className="component-asset-list">
          <header>
            <button
              onClick={() => setFolder(folder.split("/").slice(0, -1).join("/"))}
              disabled={!folder}
            >
              ↑
            </button>
            <span>{folder || "Assets"}</span>
            <button onClick={() => setOpen(false)}>×</button>
          </header>
          <button
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            None
          </button>
          {error && <p role="alert">{error}</p>}
          {entries
            .filter(
              (e) =>
                e.kind === "folder" ||
                (e.kind === kind && (kind !== "image" || validTextureAsset(e.url))),
            )
            .map((e) => (
              <button
                key={e.path}
                onClick={() => {
                  if (e.kind === "folder") setFolder(e.path);
                  else {
                    onChange(e.url);
                    setOpen(false);
                  }
                }}
              >
                {e.kind === "folder" ? "▸ " : "◇ "}
                {e.name}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
export function ComponentInspector({
  owner,
  node,
  settings,
  document,
  source = false,
}: {
  source?: boolean;
  owner: Object3D;
  node: SceneNode;
  settings: SceneProperties;
  document: SceneDocument;
}) {
  const id = owner.userData.sceneObjectId as string,
    c = settings.components ?? {};
  const [add, setAdd] = useState(""),
    [menu, setMenu] = useState<ComponentKind | null>(null);
  const set = (patch: ComponentOverrides) => command({ type: "components", id, patch });
  const props = (patch: SceneProperties) =>
    window.dispatchEvent(new CustomEvent("scene-view:node-properties", { detail: { id, patch } }));
  const actions = (kind: ComponentKind) => (
    <>
      <input
        aria-label={`Enable ${labels[kind]}`}
        type="checkbox"
        checked={c[kind]?.enabled ?? false}
        onChange={(e) => set({ [kind]: { ...c[kind], enabled: e.currentTarget.checked } })}
      />
      <button
        aria-label={`${labels[kind]} options`}
        className="editor-component-reset"
        onClick={() => setMenu(menu === kind ? null : kind)}
      >
        ⋮
      </button>
    </>
  );
  const options = (kind: ComponentKind) =>
    menu === kind && (
      <div className="component-actions">
        <button
          onClick={() => {
            set({ [kind]: defaults[kind]() });
            setMenu(null);
          }}
        >
          Reset
        </button>
        <button
          onClick={() => {
            clipboard = { kind, value: structuredClone(c[kind]) };
            setMenu(null);
          }}
        >
          Copy
        </button>
        <button
          disabled={clipboard?.kind !== kind}
          onClick={() => {
            if (clipboard?.kind === kind)
              set({ [kind]: structuredClone(clipboard.value) } as ComponentOverrides);
            setMenu(null);
          }}
        >
          Paste
        </button>
        <button
          onClick={() => {
            command({ type: "component-reset", id, kind });
            setMenu(null);
          }}
        >
          Revert override
        </button>
        <button
          onClick={() => {
            set({ [kind]: null });
            setMenu(null);
          }}
        >
          Remove
        </button>
      </div>
    );
  const numeric = (
    label: string,
    value: number,
    min: number,
    max: number,
    onCommit: (v: number) => void,
    step = 0.1,
  ) => (
    <PropertyRow label={label}>
      <NumberInput
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onCommit={onCommit}
      />
    </PropertyRow>
  );
  const vector = (
    label: string,
    value: [number, number, number],
    onChange: (v: [number, number, number]) => void,
    minimum?: number,
  ) => (
    <VectorRow
      label={label}
      values={value}
      steps={[0.1, 0.1, 0.1]}
      minimum={minimum}
      onChange={(axis, n) => {
        const next = [...value] as [number, number, number];
        next[axis] = n;
        onChange(next);
      }}
    />
  );
  let sourceMaterial: MeshStandardMaterial | undefined;
  owner.traverse((child) => {
    if (
      sourceMaterial ||
      !(child as Mesh).isMesh ||
      child.userData.sceneDecoration ||
      sceneObjectOwner(child) !== owner
    )
      return;
    const m = (child as Mesh).material;
    sourceMaterial = (Array.isArray(m) ? m[0] : m) as MeshStandardMaterial;
  });
  const baseline = {
    ...materialDefaults(),
    color:
      settings.materialColor ??
      node.color ??
      (sourceMaterial?.color ? `#${sourceMaterial.color.getHexString()}` : "#a8b5c9"),
    roughness: settings.roughness ?? sourceMaterial?.roughness ?? 0.75,
    metalness: settings.metalness ?? sourceMaterial?.metalness ?? 0,
    opacity: sourceMaterial?.opacity ?? 1,
    emissive: sourceMaterial?.emissive ? `#${sourceMaterial.emissive.getHexString()}` : "#000000",
    emissiveIntensity: sourceMaterial?.emissiveIntensity ?? 0,
  };
  const material =
    settings.material ??
    (settings.materialId ? document.materials?.[settings.materialId] : undefined);
  const editMaterial = (patch: Partial<SceneMaterial>) => {
    const next = {
      ...(material ?? baseline),
      ...patch,
    };
    if (settings.materialId && !settings.material)
      command({ type: "material-update", id, materialId: settings.materialId, material: next });
    else props({ material: next });
  };
  const scripts = c.scripts ?? [];
  const scriptEdit = (index: number, patch: Partial<ScriptComponent>) =>
    set({ scripts: scripts.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  const clips: string[] = [];
  owner.traverse((child) => {
    for (const clip of child.userData.sceneAnimationClips ?? [])
      if (!clips.includes(clip)) clips.push(clip);
  });
  return (
    <>
      {c.renderer && (
        <ComponentSection title="Mesh Renderer" kind="mesh" actions={actions("renderer")}>
          {options("renderer")}
          <PropertyRow label="Mesh">
            {source ? (
              <span>Source prefab</span>
            ) : node.template === "asset-model" ? (
              <AssetPicker
                kind="model"
                value={node.assetUrl ?? ""}
                onChange={(assetUrl) => {
                  if (assetUrl)
                    window.dispatchEvent(
                      new CustomEvent("scene-view:properties", {
                        detail: { id, patch: { assetUrl } },
                      }),
                    );
                }}
              />
            ) : (
              <select
                aria-label="Mesh"
                value={node.template}
                onChange={(e) =>
                  window.dispatchEvent(
                    new CustomEvent("scene-view:properties", {
                      detail: { id, patch: { template: e.currentTarget.value } },
                    }),
                  )
                }
              >
                {["box", "sphere", "cylinder", "cone"].map((t) => (
                  <option key={t} value={`primitive-${t}`}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </PropertyRow>
          <PropertyRow label="Material">
            <select
              aria-label="Material"
              value={settings.materialId && !settings.material ? settings.materialId : ""}
              onChange={(e) => {
                const materialId = e.currentTarget.value;
                if (materialId) command({ type: "material-assign", id, materialId });
              }}
            >
              <option value="">Instance material</option>
              {Object.entries(document.materials ?? {}).map(([key, m]) => (
                <option value={key} key={key}>
                  {m.name}
                </option>
              ))}
            </select>
          </PropertyRow>
          <div className="component-actions">
            <button
              onClick={() =>
                command({
                  type: "material-create",
                  id,
                  material: material ?? {
                    ...baseline,
                    name: `${node.name} Material`,
                  },
                })
              }
            >
              Save as material
            </button>
            {settings.materialId && (
              <button
                onClick={() => props({ material: structuredClone(material ?? materialDefaults()) })}
              >
                Make unique
              </button>
            )}
          </div>
          <ColorField
            label="Color"
            value={material?.color ?? baseline.color}
            onChange={(color) => editMaterial({ color })}
          />
          {numeric(
            "Roughness",
            material?.roughness ?? baseline.roughness,
            0,
            1,
            (v) => editMaterial({ roughness: v }),
            0.05,
          )}
          {numeric(
            "Metallic",
            material?.metalness ?? baseline.metalness,
            0,
            1,
            (v) => editMaterial({ metalness: v }),
            0.05,
          )}
          <details className="component-material">
            <summary>Textures and advanced material</summary>
            {numeric(
              "Opacity",
              material?.opacity ?? baseline.opacity,
              0,
              1,
              (v) => editMaterial({ opacity: v }),
              0.05,
            )}
            <ColorField
              label="Emission"
              value={material?.emissive ?? baseline.emissive}
              onChange={(emissive) => editMaterial({ emissive })}
            />
            {numeric(
              "Emission strength",
              material?.emissiveIntensity ?? baseline.emissiveIntensity,
              0,
              100,
              (v) => editMaterial({ emissiveIntensity: v }),
            )}
            <ToggleField
              label="Double sided"
              checked={material?.doubleSided ?? false}
              onChange={(doubleSided) => editMaterial({ doubleSided })}
            />
            {(["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap"] as const).map(
              (slot, i) => (
                <PropertyRow
                  key={slot}
                  label={["Albedo", "Normal", "Roughness map", "Metallic map", "Emission map"][i]}
                >
                  <AssetPicker
                    kind="image"
                    value={material?.[slot] ?? ""}
                    onChange={(url) => editMaterial({ [slot]: url || null })}
                  />
                </PropertyRow>
              ),
            )}
            {numeric("Normal strength", material?.normalScale ?? 1, 0, 10, (v) =>
              editMaterial({ normalScale: v }),
            )}
            {(["tiling", "offset"] as const).map((key) => (
              <PropertyRow key={key} label={key === "tiling" ? "Tiling" : "Offset"}>
                {[0, 1].map((i) => (
                  <NumberInput
                    key={i}
                    label={`${key} ${i ? "V" : "U"}`}
                    value={material?.[key][i] ?? (key === "tiling" ? 1 : 0)}
                    min={key === "tiling" ? 0.001 : -1000}
                    max={1000}
                    step={0.1}
                    onCommit={(v) => {
                      const next = [
                        ...(material?.[key] ?? (key === "tiling" ? [1, 1] : [0, 0])),
                      ] as [number, number];
                      next[i] = v;
                      editMaterial({ [key]: next });
                    }}
                  />
                ))}
              </PropertyRow>
            ))}
          </details>
          <ToggleField
            label="Cast shadows"
            checked={settings.castShadow ?? true}
            onChange={(castShadow) => props({ castShadow })}
          />
          <ToggleField
            label="Receive shadows"
            checked={settings.receiveShadow ?? true}
            onChange={(receiveShadow) => props({ receiveShadow })}
          />
        </ComponentSection>
      )}
      {c.rigidbody && (
        <ComponentSection title="Rigidbody" kind="group" actions={actions("rigidbody")}>
          {options("rigidbody")}
          <PropertyRow label="Body type">
            <select
              aria-label="Body type"
              value={c.rigidbody.type}
              onChange={(e) =>
                set({
                  rigidbody: {
                    ...c.rigidbody!,
                    type: e.currentTarget.value as "fixed" | "dynamic" | "kinematic",
                  },
                })
              }
            >
              {["fixed", "dynamic", "kinematic"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </PropertyRow>
          {(["mass", "gravityScale", "linearDamping", "angularDamping"] as const).map((key, i) =>
            numeric(
              ["Mass (kg)", "Gravity scale", "Linear damping", "Angular damping"][i],
              c.rigidbody![key],
              key === "mass" ? 0.001 : key === "gravityScale" ? -100 : 0,
              key === "mass" ? 100000 : 100,
              (v) => set({ rigidbody: { ...c.rigidbody!, [key]: v } }),
            ),
          )}
          {(["freezePosition", "freezeRotation"] as const).map((key) => (
            <PropertyRow
              key={key}
              label={key === "freezePosition" ? "Freeze position" : "Freeze rotation"}
            >
              {(["X", "Y", "Z"] as const).map((axis, i) => (
                <label key={axis}>
                  {axis}
                  <input
                    type="checkbox"
                    aria-label={`${key} ${axis}`}
                    checked={c.rigidbody![key][i]}
                    onChange={(e) => {
                      const flags = [...c.rigidbody![key]] as [boolean, boolean, boolean];
                      flags[i] = e.currentTarget.checked;
                      set({ rigidbody: { ...c.rigidbody!, [key]: flags } });
                    }}
                  />
                </label>
              ))}
            </PropertyRow>
          ))}
          <ToggleField
            label="Continuous collision"
            checked={c.rigidbody.ccd}
            onChange={(ccd) => set({ rigidbody: { ...c.rigidbody!, ccd } })}
          />
        </ComponentSection>
      )}
      {c.collider && (
        <ComponentSection title="Collider" kind="mesh" actions={actions("collider")}>
          {options("collider")}
          <PropertyRow label="Shape">
            <select
              aria-label="Collider shape"
              value={c.collider.shape}
              onChange={(e) =>
                set({
                  collider: {
                    ...c.collider!,
                    shape: e.currentTarget.value as "auto" | "box" | "sphere" | "capsule",
                  },
                })
              }
            >
              {(source && Number(owner.userData.sceneColliderCount) > 1
                ? ["auto"]
                : ["auto", "box", "sphere", "capsule"]
              ).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </PropertyRow>
          {c.collider.shape !== "auto" && (
            <>
              {vector("Center", c.collider.center, (center) =>
                set({ collider: { ...c.collider!, center } }),
              )}
              {vector(
                "Collider rotation",
                c.collider.rotation.map((v) => (v * 180) / Math.PI) as [number, number, number],
                (v) =>
                  set({
                    collider: {
                      ...c.collider!,
                      rotation: v.map((n) => (n * Math.PI) / 180) as [number, number, number],
                    },
                  }),
              )}
            </>
          )}
          {c.collider.shape === "box" &&
            vector(
              "Size",
              c.collider.size,
              (size) => set({ collider: { ...c.collider!, size } }),
              0.001,
            )}
          {(c.collider.shape === "sphere" || c.collider.shape === "capsule") &&
            numeric("Radius", c.collider.radius, 0.001, 10000, (radius) =>
              set({ collider: { ...c.collider!, radius } }),
            )}
          {c.collider.shape === "capsule" &&
            numeric("Height", c.collider.height, 0.002, 10000, (height) =>
              set({ collider: { ...c.collider!, height } }),
            )}
          {numeric("Friction", c.collider.friction, 0, 10, (friction) =>
            set({ collider: { ...c.collider!, friction } }),
          )}
          {numeric(
            "Bounciness",
            c.collider.restitution,
            0,
            1,
            (restitution) => set({ collider: { ...c.collider!, restitution } }),
            0.05,
          )}
          <ToggleField
            label="Is trigger"
            checked={c.collider.sensor}
            onChange={(sensor) => set({ collider: { ...c.collider!, sensor } })}
          />
        </ComponentSection>
      )}
      {c.animation && (
        <ComponentSection title="Animation" kind="group" actions={actions("animation")}>
          {options("animation")}
          <PropertyRow label="Clip">
            <select
              aria-label="Animation clip"
              value={c.animation.clip}
              onChange={(e) => set({ animation: { ...c.animation!, clip: e.currentTarget.value } })}
            >
              <option value="">First clip</option>
              {clips.map((clip) => (
                <option key={clip}>{clip}</option>
              ))}
            </select>
          </PropertyRow>
          {!clips.length && (
            <p className="editor-property-note">This model contains no animation clips.</p>
          )}
          {numeric("Playback speed", c.animation.speed, 0, 10, (speed) =>
            set({ animation: { ...c.animation!, speed } }),
          )}
          <ToggleField
            label="Play automatically"
            checked={c.animation.autoplay}
            onChange={(autoplay) => set({ animation: { ...c.animation!, autoplay } })}
          />
          <ToggleField
            label="Loop"
            checked={c.animation.loop}
            onChange={(loop) => set({ animation: { ...c.animation!, loop } })}
          />
        </ComponentSection>
      )}
      {scripts.map((script, index) => {
        const definition = sceneBehaviors[script.script as keyof typeof sceneBehaviors];
        return (
          <ComponentSection
            key={script.id}
            title={definition?.name ?? `Missing script: ${script.script}`}
            kind="group"
            actions={
              <>
                <input
                  type="checkbox"
                  aria-label={`Enable ${definition?.name ?? script.script}`}
                  checked={script.enabled}
                  onChange={(e) => scriptEdit(index, { enabled: e.currentTarget.checked })}
                />
                <button
                  className="editor-component-reset"
                  aria-label={`Remove ${script.script} script`}
                  onClick={() => set({ scripts: scripts.filter((_, i) => i !== index) })}
                >
                  ×
                </button>
              </>
            }
          >
            {Object.entries(script.fields).map(([key, value]) =>
              typeof value === "number" ? (
                numeric(key, value, -100000, 100000, (v) =>
                  scriptEdit(index, { fields: { ...script.fields, [key]: v } }),
                )
              ) : key === "axis" ? (
                <PropertyRow key={key} label="Axis">
                  <select
                    value={String(value)}
                    onChange={(e) =>
                      scriptEdit(index, {
                        fields: { ...script.fields, axis: e.currentTarget.value },
                      })
                    }
                  >
                    {["x", "y", "z"].map((axis) => (
                      <option key={axis}>{axis}</option>
                    ))}
                  </select>
                </PropertyRow>
              ) : null,
            )}
            <p className="editor-property-note">
              {c.collider || c.rigidbody
                ? "This motion drives the physics body kinematically during Play."
                : "Runs during Play."}
            </p>
          </ComponentSection>
        );
      })}
      <div className="component-add">
        <select
          aria-label="Add component"
          value={add}
          onChange={(e) => {
            const key = e.currentTarget.value;
            setAdd("");
            if (key.startsWith("script:")) {
              const script = key.slice(7) as keyof typeof sceneBehaviors;
              set({
                scripts: [
                  ...scripts,
                  {
                    id: `script-${crypto.randomUUID()}`,
                    script,
                    enabled: true,
                    fields: { ...sceneBehaviors[script].fields },
                  },
                ],
              });
            } else if (key) set({ [key]: defaults[key as ComponentKind]() });
          }}
        >
          <option value="">＋ Add Component</option>
          {(Object.keys(labels) as ComponentKind[])
            .filter(
              (key) =>
                !c[key] &&
                (key !== "animation" || node.template === "asset-model") &&
                (!source ||
                  key === "renderer" ||
                  key === "rigidbody" ||
                  Boolean(owner.userData.scenePhysicsDefaults?.collider)),
            )
            .map((key) => (
              <option key={key} value={key}>
                {labels[key]}
              </option>
            ))}
          {!source &&
            Object.entries(sceneBehaviors).map(([key, d]) => (
              <option key={key} value={`script:${key}`}>
                {d.name} (Script)
              </option>
            ))}
        </select>
      </div>
      <details className="component-prefab">
        <summary>Prefab overrides</summary>
        <p className="editor-property-note">
          Shared defaults apply to other instances of this template. Position, name and visibility
          stay on this object.
        </p>
        <button
          disabled={
            !Object.keys(document.properties[id] ?? {}).some(
              (k) => !["name", "visible", "locked"].includes(k),
            )
          }
          onClick={() => command({ type: "apply-prefab", id })}
        >
          Apply to template
        </button>
      </details>
    </>
  );
}
