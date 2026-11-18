import { inspectTransform, editInspectedTransform } from "./inspectorTransforms";
import { MultiInspector } from "./MultiInspector";
import { getSelectedIds, subscribeSelection } from "./sceneSelection";
import { ComponentInspector } from "./ComponentInspector";
import { editableTemplate } from "../gameplay/sceneComponents";
import { WORLD_ROOT_ID } from "../gameplay/sceneDocument";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Color, Light, Material, Mesh, Object3D, PerspectiveCamera, Scene } from "three";
import { sceneObjectOwner } from "../components/SceneObject";
import type { SceneNode, SceneProperties } from "../gameplay/sceneDocument";
import { ChevronIcon, EyeIcon, LockIcon, NodeTypeIcon, RevertIcon } from "./editorIcons";
import { objectKind } from "./sceneGraph";

type EditableMaterial = Material & {
  color?: Color;
  roughness?: number;
  metalness?: number;
};

function ownerMesh(owner: Object3D) {
  let found: Mesh | null = null;
  owner.traverse((child) => {
    if (
      found ||
      !(child as Mesh).isMesh ||
      child.userData.sceneDecoration ||
      sceneObjectOwner(child) !== owner
    )
      return;
    found = child as Mesh;
  });
  return found as Mesh | null;
}

function ownerMaterial(owner: Object3D) {
  const mesh = ownerMesh(owner);
  if (!mesh) return null;
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return (material as EditableMaterial | undefined) ?? null;
}

function ownerLight(owner: Object3D) {
  let found: Light | null = null;
  owner.traverse((child) => {
    if (found || !(child as Light).isLight || sceneObjectOwner(child) !== owner) return;
    found = child as Light;
  });
  return found as Light | null;
}

function ownerCamera(owner: Object3D) {
  let found: PerspectiveCamera | null = null;
  owner.traverse((child) => {
    if (
      !found &&
      (child as PerspectiveCamera).isPerspectiveCamera &&
      sceneObjectOwner(child) === owner
    )
      found = child as PerspectiveCamera;
  });
  return found as PerspectiveCamera | null;
}

function send(name: string, detail: unknown) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function NumberInput({
  label,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step: number;
  onCommit: (value: number) => void;
}) {
  return (
    <input
      key={`${label}:${value}`}
      aria-label={label}
      className="editor-number-input"
      type="number"
      step={step}
      min={min}
      max={max}
      defaultValue={Number(value.toFixed(3))}
      onFocus={(event) => {
        event.currentTarget.value = String(value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.currentTarget.value = String(value);
          event.currentTarget.blur();
          event.stopPropagation();
        }
      }}
      onBlur={(event) => {
        const next = event.currentTarget.valueAsNumber;
        if (!Number.isFinite(next)) {
          event.currentTarget.value = String(Number(value.toFixed(3)));
          return;
        }
        const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, next));
        if (clamped === value) {
          event.currentTarget.value = String(Number(value.toFixed(3)));
          return;
        }
        onCommit(clamped);
      }}
    />
  );
}

export function PropertyRow({
  label,
  overridden,
  onReset,
  children,
}: {
  label: string;
  overridden?: boolean;
  onReset?: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`editor-property-row${overridden ? " is-overridden" : ""}`}>
      <span className="editor-property-label" title={label}>
        {label}
      </span>
      <span className="editor-property-value">{children}</span>
      {overridden && onReset ? (
        <button
          className="editor-property-revert"
          title={`Revert ${label} to the prefab default`}
          aria-label={`Revert ${label}`}
          onClick={onReset}
        >
          <RevertIcon />
        </button>
      ) : (
        <span className="editor-property-revert-spacer" />
      )}
    </div>
  );
}

export function ColorField({
  label,
  value,
  overridden,
  onReset,
  onChange,
}: {
  label: string;
  value: string;
  overridden?: boolean;
  onReset?: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <PropertyRow label={label} overridden={overridden} onReset={onReset}>
      <span className="editor-color-field">
        <input
          key={value}
          aria-label={label}
          type="color"
          defaultValue={value}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <code>{value}</code>
      </span>
    </PropertyRow>
  );
}

export function ToggleField({
  label,
  checked,
  overridden,
  onReset,
  onChange,
}: {
  label: string;
  checked: boolean;
  overridden?: boolean;
  onReset?: () => void;
  onChange: (checked: boolean) => void;
}) {
  return (
    <PropertyRow label={label} overridden={overridden} onReset={onReset}>
      <input
        aria-label={label}
        className="editor-boolean-input"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </PropertyRow>
  );
}

export function VectorRow({
  label,
  values,
  steps,
  minimum,
  onChange,
}: {
  label: string;
  values: [number, number, number];
  steps: [number, number, number];
  minimum?: number;
  onChange: (axis: 0 | 1 | 2, value: number) => void;
}) {
  return (
    <div className="editor-vector-row">
      <span className="editor-property-label">{label}</span>
      <div className="editor-vector-fields">
        {(["x", "y", "z"] as const).map((axis, index) => (
          <label key={axis} className={`axis-${axis}`}>
            <span className="editor-axis-letter">{axis.toUpperCase()}</span>
            <input
              key={`${axis}:${values[index]}`}
              aria-label={`${label.toLowerCase()} ${axis}`}
              type="number"
              step={steps[index]}
              min={minimum}
              defaultValue={Number(values[index].toFixed(3))}
              onFocus={(event) => {
                event.currentTarget.value = String(values[index]);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                  event.currentTarget.value = String(values[index]);
                  event.currentTarget.blur();
                  event.stopPropagation();
                }
              }}
              onBlur={(event) => {
                const next = event.currentTarget.valueAsNumber;
                if (!Number.isFinite(next) || (minimum !== undefined && next < minimum)) {
                  event.currentTarget.value = String(Number(values[index].toFixed(3)));
                  return;
                }
                if (next === values[index]) {
                  event.currentTarget.value = String(Number(values[index].toFixed(3)));
                  return;
                }
                onChange(index as 0 | 1 | 2, next);
              }}
            />
          </label>
        ))}
      </div>
      <span className="editor-property-revert-spacer" />
    </div>
  );
}

export function ComponentSection({
  title,
  kind,
  actions,
  children,
}: {
  title: string;
  kind: "mesh" | "light" | "group" | "camera";
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="editor-component">
      <header className="editor-component-header">
        <button
          className="editor-component-toggle"
          aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronIcon open={open} />
        </button>
        <span className={`editor-component-icon kind-${kind}`}>
          <NodeTypeIcon kind={kind === "group" ? "group" : kind} size={13} />
        </span>
        <strong className="editor-component-title">{title}</strong>
        {actions}
      </header>
      {open && <div className="editor-component-body">{children}</div>}
    </section>
  );
}

function componentName(owner: Object3D, light: Light | null, primitive: boolean) {
  if (light) return "Light";
  if (primitive) return "MeshInstance3D";
  if (owner.userData.sceneNode) return "Node3D";
  return owner.type === "Group" ? "Node3D" : `${owner.type}3D`;
}

export function SceneInspector({
  object,
  readOnly = false,
  scene,
  pinnedId,
  togglePin,
}: {
  object: Object3D | null;
  readOnly?: boolean;
  scene?: Scene | null;
  pinnedId?: string | null;
  togglePin?: () => void;
}) {
  const ids = useSyncExternalStore(subscribeSelection, getSelectedIds, getSelectedIds);
  const [, refresh] = useState(0);
  const [query, setQuery] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [transformSpace, setTransformSpace] = useState<"local" | "world">("local");
  useEffect(() => {
    const update = () => refresh((n) => n + 1);
    window.addEventListener("scene-view:document", update);
    return () => window.removeEventListener("scene-view:document", update);
  }, []);

  const multiple: Object3D[] = [];
  if (!pinnedId && ids.length > 1)
    scene?.traverse((node) => {
      if (ids.includes(node.userData.sceneObjectId)) multiple.push(node);
    });
  if (multiple.length > 1) return <MultiInspector objects={multiple} readOnly={readOnly} />;
  let inspected = object;
  if (pinnedId) {
    inspected = null;
    scene?.traverse((node) => {
      if (node.userData.sceneObjectId === pinnedId) inspected = node;
    });
  }
  const owner = sceneObjectOwner(inspected);
  const pin = (
    <button
      className="inspector-pin"
      aria-label={pinnedId ? "Unlock Inspector" : "Lock Inspector"}
      title={pinnedId ? "Unlock Inspector selection" : "Keep inspecting this object"}
      aria-pressed={Boolean(pinnedId)}
      disabled={!togglePin || (!owner && !pinnedId)}
      onClick={togglePin}
    >
      <LockIcon locked={Boolean(pinnedId)} size={12} />
    </button>
  );
  const needle = query.trim().toLowerCase();
  const matches = (...labels: string[]) =>
    !needle || labels.some((label) => label.toLowerCase().includes(needle));

  if (!owner) {
    return (
      <section className="editor-panel editor-inspector" aria-label="Inspector">
        <header className="editor-panel-header">
          <span className="editor-panel-title">Inspector</span>
          {pin}
        </header>
        <div className="editor-inspector-empty">
          <strong>{object ? object.name || object.type : "Nothing selected"}</strong>
          <p>
            {object
              ? "Built-in scene content. Select an authored object in the Hierarchy to edit its saved components."
              : "Select an object in the Hierarchy to inspect and edit it."}
          </p>
        </div>
      </section>
    );
  }

  const id = owner.userData.sceneObjectId as string;
  const settings = (owner.userData.sceneProperties ?? {}) as SceneProperties;
  const ownSettings = (owner.userData.sceneOwnProperties ?? settings) as SceneProperties;
  const node = owner.userData.sceneNode as SceneNode | undefined;
  const material = owner.userData.sceneObjectId === WORLD_ROOT_ID ? null : ownerMaterial(owner);
  const mesh = owner.userData.sceneObjectId === WORLD_ROOT_ID ? null : ownerMesh(owner);
  const light = owner.userData.sceneObjectId === WORLD_ROOT_ID ? null : ownerLight(owner);
  const camera = ownerCamera(owner);
  const sourceDefaults = owner.userData.scenePhysicsDefaults;
  const managed = Boolean(node && editableTemplate(node.template));
  const componentEditable = managed || Boolean(sourceDefaults);
  const primitive = Boolean(node?.template.startsWith("primitive-"));
  let assetError = false;
  owner.traverse((child) => {
    if (child.userData.assetLoadError) assetError = true;
  });
  const type = camera ? "Camera3D" : componentName(owner, light, primitive);
  const visible = settings.visible !== false;
  const kind = objectKind(owner);

  const setNode = (patch: Partial<SceneNode>) => send("scene-view:properties", { id, patch });
  const setProps = (patch: SceneProperties) => send("scene-view:node-properties", { id, patch });
  const reset = (key: keyof SceneProperties) => send("scene-view:reset-property", { id, key });
  const overrides = Object.keys(ownSettings);
  const hasOverrides = overrides.length > 0;

  const materialColor = primitive
    ? (node?.color ?? "#a8b5c9")
    : (settings.materialColor ??
      (material?.color ? `#${material.color.getHexString()}` : "#a8b5c9"));
  const lightColor = settings.lightColor ?? (light ? `#${light.color.getHexString()}` : "#ffffff");
  const meshLabel =
    node?.template.replace("primitive-", "").replace(/^\w/, (letter) => letter.toUpperCase()) ??
    "Primitive";

  const matchesTitle = (title: string) => !needle || title.toLowerCase().includes(needle);
  const meshTitle = type === "Node3D" ? "MeshInstance3D" : type;
  const meshTitleMatch = matchesTitle(meshTitle);
  const lightTitle = light ? "Light" : "";
  const lightTitleMatch = matchesTitle(lightTitle);
  const rigidTitleMatch = matchesTitle("RigidBody3D");
  const transformTitleMatch = matchesTitle("Node3D");
  const showMesh =
    Boolean(material || mesh) &&
    (meshTitleMatch ||
      matches(
        "Mesh",
        "Material",
        "Color",
        "Roughness",
        "Metalness",
        "Cast Shadow",
        "Receive Shadow",
      ));
  const showLight =
    Boolean(light) &&
    (lightTitleMatch || matches("Light", "Color", "Intensity", "Shadow", "Energy"));
  const showRigidbody =
    primitive && (rigidTitleMatch || matches("Rigidbody", "Dynamic", "Body Type"));
  const showTransform =
    transformTitleMatch || matches("Transform", "Position", "Rotation", "Scale");
  const showCamera =
    Boolean(camera) &&
    matches("Camera3D", "Camera", "Field of View", "FOV", "Near", "Far", "Clipping");
  const showAnything =
    showCamera ||
    showMesh ||
    showLight ||
    showRigidbody ||
    showTransform ||
    matches("Material", "Color", "Roughness", "Metalness", "Shadow", "Light", "Intensity");

  const inspectedTransform = inspectTransform(owner, transformSpace);
  const editTransform = (
    field: "position" | "rotation" | "scale",
    axis: 0 | 1 | 2,
    value: number,
  ) => {
    editInspectedTransform(owner, transformSpace, field, axis, value);
    send("scene-view:commit", owner);
  };
  const setName = (name: string) => setProps({ name });

  return (
    <section className="editor-panel editor-inspector" aria-label="Inspector">
      <header className="editor-panel-header">
        <span className="editor-panel-title">Inspector</span>
        <button
          className="inspector-search-toggle"
          aria-label="Search Inspector properties"
          title="Search properties"
          aria-pressed={showFilter}
          onClick={() => {
            setShowFilter((value) => !value);
            setQuery("");
          }}
        >
          ⌕
        </button>
        {pin}
      </header>
      {showFilter && (
        <div className="editor-inspector-filter">
          <input
            aria-label="Filter inspector properties"
            placeholder="Filter properties…"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setQuery("");
            }}
          />
          {query && (
            <button aria-label="Clear property filter" onClick={() => setQuery("")}>
              ×
            </button>
          )}
        </div>
      )}
      <fieldset className="editor-inspector-scroll" disabled={readOnly}>
        <header className="editor-object-header">
          <span className={`editor-object-icon kind-${kind}`}>
            <NodeTypeIcon kind={kind} size={16} />
          </span>
          <div className="editor-object-identity">
            <input
              key={settings.name ?? owner.name}
              aria-label="Node name"
              className="editor-object-name"
              defaultValue={settings.name ?? owner.name}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                  event.currentTarget.value = settings.name ?? owner.name;
                  event.currentTarget.blur();
                }
              }}
              onBlur={(event) => {
                const name = event.currentTarget.value.trim();
                if (!name) {
                  event.currentTarget.value = settings.name ?? owner.name;
                  return;
                }
                if (name !== (settings.name ?? owner.name)) setName(name);
              }}
            />
          </div>
          {settings.name !== undefined && (
            <button
              className="editor-property-revert"
              aria-label="Revert node name"
              title="Revert node name to the authored default"
              onClick={() => reset("name")}
            >
              <RevertIcon />
            </button>
          )}
          <div className="editor-object-actions">
            <button
              className="editor-object-action"
              aria-label="Toggle visibility"
              aria-pressed={visible}
              title={visible ? "Hide node" : "Show node"}
              onClick={() => setProps({ visible: !visible })}
            >
              <EyeIcon visible={visible} />
            </button>
          </div>
        </header>

        {assetError && (
          <p className="editor-property-note" role="alert">
            This model could not be loaded. Check its asset file or remove the node.
          </p>
        )}
        {showTransform && (
          <ComponentSection
            title="Transform"
            kind="group"
            actions={
              <>
                <select
                  aria-label="Transform coordinates"
                  title="Local is relative to the parent object. World is relative to the scene origin."
                  value={transformSpace}
                  onChange={(e) => setTransformSpace(e.currentTarget.value as "local" | "world")}
                >
                  <option value="local">Local</option>
                  <option value="world">World</option>
                </select>
                {transformTitleMatch || matches("Transform") ? (
                  <button
                    className="editor-component-reset"
                    aria-label="Reset Transform"
                    title="Reset Transform"
                    onClick={() => {
                      owner.position.set(0, 0, 0);
                      owner.rotation.set(0, 0, 0);
                      owner.scale.set(1, 1, 1);
                      owner.updateMatrix();
                      owner.updateMatrixWorld(true);
                      send("scene-view:commit", owner);
                    }}
                  >
                    ↺
                  </button>
                ) : undefined}
              </>
            }
          >
            {(transformTitleMatch || matches("Position")) && (
              <VectorRow
                label="Position"
                values={inspectedTransform.position}
                steps={[0.1, 0.1, 0.1]}
                onChange={(axis, value) => {
                  editTransform("position", axis, value);
                }}
              />
            )}
            {(transformTitleMatch || matches("Rotation")) && (
              <VectorRow
                label="Rotation"
                values={[
                  (inspectedTransform.rotation[0] * 180) / Math.PI,
                  (inspectedTransform.rotation[1] * 180) / Math.PI,
                  (inspectedTransform.rotation[2] * 180) / Math.PI,
                ]}
                steps={[1, 1, 1]}
                onChange={(axis, value) => {
                  editTransform("rotation", axis, (value * Math.PI) / 180);
                }}
              />
            )}
            {(transformTitleMatch || matches("Scale")) && (
              <VectorRow
                label="Scale"
                values={inspectedTransform.scale}
                steps={[0.1, 0.1, 0.1]}
                minimum={0.01}
                onChange={(axis, value) => {
                  editTransform("scale", axis, value);
                }}
              />
            )}
          </ComponentSection>
        )}

        {!componentEditable && (material || mesh) && showMesh && (
          <ComponentSection title="Mesh Renderer" kind="mesh">
            {(meshTitleMatch || matches("Mesh")) && (
              <PropertyRow label="Mesh">
                <span className="editor-resource-row">
                  <span className="editor-resource-icon">◇</span>
                  <code title={node?.assetUrl}>
                    {node?.assetUrl
                      ? decodeURIComponent(node.assetUrl.split("/").at(-1) ?? "Model")
                      : primitive
                        ? meshLabel
                        : (mesh?.geometry?.type ?? "Mesh")}
                  </code>
                </span>
              </PropertyRow>
            )}
            {(meshTitleMatch || matches("Material", "Color")) && (
              <ColorField
                label="Color"
                value={materialColor}
                overridden={!primitive && settings.materialColor !== undefined}
                onReset={primitive ? undefined : () => reset("materialColor")}
                onChange={(value) =>
                  primitive ? setNode({ color: value }) : setProps({ materialColor: value })
                }
              />
            )}
            {material &&
              typeof material.roughness === "number" &&
              (meshTitleMatch || matches("Roughness")) && (
                <PropertyRow
                  label="Roughness"
                  overridden={settings.roughness !== undefined}
                  onReset={() => reset("roughness")}
                >
                  <NumberInput
                    label="Roughness"
                    value={settings.roughness ?? material.roughness}
                    min={0}
                    max={1}
                    step={0.05}
                    onCommit={(value) => setProps({ roughness: value })}
                  />
                </PropertyRow>
              )}
            {material &&
              typeof material.metalness === "number" &&
              (meshTitleMatch || matches("Metalness")) && (
                <PropertyRow
                  label="Metalness"
                  overridden={settings.metalness !== undefined}
                  onReset={() => reset("metalness")}
                >
                  <NumberInput
                    label="Metalness"
                    value={settings.metalness ?? material.metalness}
                    min={0}
                    max={1}
                    step={0.05}
                    onCommit={(value) => setProps({ metalness: value })}
                  />
                </PropertyRow>
              )}
            {mesh && (meshTitleMatch || matches("Cast Shadow")) && (
              <ToggleField
                label="Cast Shadow"
                checked={settings.castShadow ?? mesh.castShadow}
                overridden={settings.castShadow !== undefined && !light}
                onReset={() => reset("castShadow")}
                onChange={(checked) => setProps({ castShadow: checked })}
              />
            )}
            {mesh && (meshTitleMatch || matches("Receive Shadow")) && (
              <ToggleField
                label="Receive Shadow"
                checked={settings.receiveShadow ?? mesh.receiveShadow}
                overridden={settings.receiveShadow !== undefined}
                onReset={() => reset("receiveShadow")}
                onChange={(checked) => setProps({ receiveShadow: checked })}
              />
            )}
          </ComponentSection>
        )}

        {light && showLight && (
          <ComponentSection title="Light" kind="light">
            {(lightTitleMatch || matches("Type")) && (
              <PropertyRow label="Type">
                <code>{light.type.replace("Light", "")}</code>
              </PropertyRow>
            )}
            {(lightTitleMatch || matches("Color")) && (
              <ColorField
                label="Color"
                value={lightColor}
                overridden={settings.lightColor !== undefined}
                onReset={() => reset("lightColor")}
                onChange={(value) => setProps({ lightColor: value })}
              />
            )}
            {(lightTitleMatch || matches("Intensity", "Energy")) && (
              <PropertyRow
                label="Intensity"
                overridden={settings.lightIntensity !== undefined}
                onReset={() => reset("lightIntensity")}
              >
                <NumberInput
                  label="Intensity"
                  value={settings.lightIntensity ?? light.intensity}
                  min={0}
                  max={10000}
                  step={0.1}
                  onCommit={(value) => setProps({ lightIntensity: value })}
                />
              </PropertyRow>
            )}
            {(lightTitleMatch || matches("Cast Shadow")) && (
              <ToggleField
                label="Cast Shadow"
                checked={settings.castShadow ?? light.castShadow}
                overridden={settings.castShadow !== undefined}
                onReset={() => reset("castShadow")}
                onChange={(checked) => setProps({ castShadow: checked })}
              />
            )}
          </ComponentSection>
        )}

        {camera && showCamera && (
          <ComponentSection title="Camera" kind="camera">
            {(
              [
                ["Field of View", "cameraFov", camera.fov, 1, 179, 1],
                ["Near Clip", "cameraNear", camera.near, 0.001, camera.far - 0.001, 0.01],
                ["Far Clip", "cameraFar", camera.far, camera.near + 0.001, 100000, 1],
              ] as const
            )
              .filter(([label]) =>
                matches(
                  "Camera3D",
                  "Camera",
                  label,
                  label === "Field of View" ? "FOV" : "Clipping",
                ),
              )
              .map(([label, key, value, min, max, step]) => (
                <PropertyRow
                  key={key}
                  label={label}
                  overridden={settings[key] !== undefined}
                  onReset={() => reset(key)}
                >
                  <NumberInput
                    label={label}
                    value={settings[key] ?? value}
                    min={min}
                    max={max}
                    step={step}
                    onCommit={(next) => setProps({ [key]: next })}
                  />
                </PropertyRow>
              ))}
            <p className="editor-property-note">
              The preview shows this saved camera. Scene navigation uses a separate editor camera.
            </p>
          </ComponentSection>
        )}

        {!componentEditable && showRigidbody && (
          <ComponentSection title="Rigidbody" kind="group">
            <PropertyRow label="Body Type">
              <select
                aria-label="Body type"
                value={node?.dynamic ? "dynamic" : "fixed"}
                onChange={(event) => setNode({ dynamic: event.currentTarget.value === "dynamic" })}
              >
                <option value="fixed">Fixed</option>
                <option value="dynamic">Dynamic</option>
              </select>
            </PropertyRow>
          </ComponentSection>
        )}

        {componentEditable && owner.userData.sceneDocument && (
          <ComponentInspector
            owner={owner}
            node={node ?? { name: owner.name, template: id }}
            source={!managed}
            settings={{
              ...settings,
              components: {
                ...(managed
                  ? {}
                  : { renderer: mesh ? { enabled: true } : null, ...sourceDefaults }),
                ...settings.components,
              },
            }}
            document={owner.userData.sceneDocument}
          />
        )}

        {!showAnything && !managed && (
          <p className="editor-inspector-empty-note">
            No properties match “{query.trim()}”. Clear the filter to see everything.
          </p>
        )}
      </fieldset>
      {hasOverrides && (
        <footer className="editor-inspector-footer">
          {hasOverrides && (
            <button
              disabled={readOnly}
              className="editor-property-reset"
              title="Remove every saved property override"
              onClick={() => send("scene-view:reset-properties", id)}
            >
              Revert overrides
            </button>
          )}
        </footer>
      )}
    </section>
  );
}
