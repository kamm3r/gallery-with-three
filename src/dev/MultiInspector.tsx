import type { Object3D } from "three";
import { readSceneTransform } from "../components/SceneObject";
import { ComponentSection, PropertyRow, ToggleField } from "./SceneInspector";
import type { BatchAction } from "../gameplay/sceneBatchEdits";
import type { SceneProperties } from "../gameplay/sceneDocument";
import { editableTemplate } from "../gameplay/sceneComponents";
export function MultiInspector({ objects, readOnly }: { objects: Object3D[]; readOnly: boolean }) {
  const ids = objects.map((o) => String(o.userData.sceneObjectId));
  const settings = objects.map((o) => o.userData.sceneProperties as SceneProperties);
  const transforms = Object.fromEntries(
    objects.map((o) => [o.userData.sceneObjectId, readSceneTransform(o)]),
  );
  const send = (action: BatchAction) =>
    window.dispatchEvent(new CustomEvent("scene-view:batch-edit", { detail: { ...action, ids } }));
  const number = (
    label: string,
    values: number[],
    onCommit: (v: number) => void,
    min?: number,
    max?: number,
  ) => {
    const mixed = values.some((v) => v !== values[0]);
    return (
      <PropertyRow key={label} label={label}>
        <input
          key={values.join(",")}
          type="number"
          className="editor-number-input"
          aria-label={label}
          placeholder={mixed ? "—" : ""}
          defaultValue={mixed ? "" : values[0]}
          min={min}
          max={max}
          step={0.1}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              e.currentTarget.value = mixed ? "" : String(values[0]);
              e.currentTarget.blur();
            }
          }}
          onBlur={(e) => {
            const value = e.currentTarget.valueAsNumber;
            if (
              Number.isFinite(value) &&
              (min === undefined || value >= min) &&
              (max === undefined || value <= max)
            )
              onCommit(value);
          }}
        />
      </PropertyRow>
    );
  };
  const ownNodes = objects.every(
    (o) => o.userData.sceneNode && editableTemplate(o.userData.sceneNode.template),
  );
  return (
    <section className="editor-panel editor-inspector" aria-label="Inspector">
      <header className="editor-panel-header">
        <span className="editor-panel-title">Inspector</span>
      </header>
      <fieldset className="editor-inspector-scroll" disabled={readOnly}>
        <header className="editor-object-header">
          <strong>{objects.length} objects selected</strong>
        </header>
        <p className="editor-property-note">
          — indicates mixed values. Changes apply to every unlocked selection.
        </p>
        <ComponentSection title="Transform" kind="group">
          {(["position", "rotation", "scale"] as const).map((field) =>
            ([0, 1, 2] as const).map((axis) =>
              number(
                `${field} ${["X", "Y", "Z"][axis]}`,
                objects.map(
                  (o) =>
                    transforms[o.userData.sceneObjectId][field][axis] *
                    (field === "rotation" ? 180 / Math.PI : 1),
                ),
                (value) =>
                  send({
                    type: "transform",
                    field,
                    axis,
                    value: field === "rotation" ? (value * Math.PI) / 180 : value,
                    transforms,
                  }),
                field === "scale" ? 0.01 : undefined,
              ),
            ),
          )}
        </ComponentSection>
        <ComponentSection title="Object" kind="group">
          <ToggleField
            label="Visible"
            checked={settings.every((p) => p.visible !== false)}
            onChange={(visible) => send({ type: "property", patch: { visible } })}
          />
          <PropertyRow label="Material color">
            <input
              type="color"
              aria-label="Material color"
              value={settings[0]?.materialColor ?? "#a8b5c9"}
              onChange={(e) =>
                send({ type: "property", patch: { materialColor: e.currentTarget.value } })
              }
            />
          </PropertyRow>
        </ComponentSection>
        {settings.every((p) => p.components?.rigidbody) && (
          <ComponentSection title="Rigidbody" kind="group">
            {(["mass", "gravityScale", "linearDamping", "angularDamping"] as const).map((field) =>
              number(
                field,
                settings.map((p) => p.components!.rigidbody![field]),
                (value) => send({ type: "body", field, value }),
                field === "mass" ? 0.001 : field === "gravityScale" ? -100 : 0,
                field === "mass" ? 100000 : 100,
              ),
            )}
          </ComponentSection>
        )}
        {settings.every((p) => p.components?.collider) && (
          <ComponentSection title="Collider" kind="mesh">
            {(["friction", "restitution"] as const).map((field) =>
              number(
                field,
                settings.map((p) => p.components!.collider![field]),
                (value) => send({ type: "collider", field, value }),
                0,
                field === "friction" ? 10 : 1,
              ),
            )}
            <ToggleField
              label="Is trigger"
              checked={settings.every((p) => p.components!.collider!.sensor)}
              onChange={(value) => send({ type: "collider", field: "sensor", value })}
            />
          </ComponentSection>
        )}
        {ownNodes && (
          <div className="component-add">
            <select
              aria-label="Add component to selection"
              value=""
              onChange={(e) => {
                const kind = e.currentTarget.value;
                if (kind === "renderer" || kind === "rigidbody" || kind === "collider")
                  send({ type: "add", kind });
              }}
            >
              <option value="">＋ Add Component to Selection</option>
              {["renderer", "rigidbody", "collider"].map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </select>
          </div>
        )}
      </fieldset>
    </section>
  );
}
