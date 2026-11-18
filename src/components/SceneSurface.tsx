import { useLayoutEffect, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  DoubleSide,
  FrontSide,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Group,
  type Mesh,
  type MeshStandardMaterial,
  type Texture,
} from "three";
import { sceneObjectOwner } from "./SceneObject";
import type { SceneProperties } from "../gameplay/sceneDocument";
import type { SceneMaterial } from "../gameplay/sceneComponents";
const slots = ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap"] as const;
export function SceneSurface({
  root,
  settings,
  material,
}: {
  root: RefObject<Group | null>;
  settings: SceneProperties;
  material?: SceneMaterial;
}) {
  const applied = useRef(new Map<Mesh, () => void>());
  const signature = JSON.stringify([
    settings.components?.renderer,
    settings.materialColor,
    settings.roughness,
    settings.metalness,
    settings.castShadow,
    settings.receiveShadow,
    material,
  ]);
  useLayoutEffect(() => {
    const current = applied.current;
    return () => {
      current.forEach((cleanup) => cleanup());
      current.clear();
    };
  }, [signature]);
  const hasMaterial = Boolean(
    material ||
    settings.materialColor ||
    settings.roughness !== undefined ||
    settings.metalness !== undefined,
  );
  useFrame(() => {
    if (
      !root.current ||
      (!hasMaterial &&
        settings.components?.renderer === undefined &&
        settings.castShadow === undefined &&
        settings.receiveShadow === undefined)
    )
      return;
    const current = applied.current;
    for (const [mesh, cleanup] of current)
      if (sceneObjectOwner(mesh) !== root.current) {
        cleanup();
        current.delete(mesh);
      }
    root.current.traverse((child) => {
      const mesh = child as Mesh;
      if (
        !mesh.isMesh ||
        mesh.userData.sceneDecoration ||
        sceneObjectOwner(mesh) !== root.current ||
        current.has(mesh)
      )
        return;
      const visible = mesh.visible,
        previous = mesh.material,
        cast = mesh.castShadow,
        receive = mesh.receiveShadow;
      const renderer = settings.components?.renderer;
      if (renderer === null || renderer?.enabled === false) mesh.visible = false;
      if (settings.castShadow !== undefined) mesh.castShadow = settings.castShadow;
      if (settings.receiveShadow !== undefined) mesh.receiveShadow = settings.receiveShadow;
      const textures: Texture[] = [];
      let disposed = false;
      const originals = Array.isArray(previous) ? previous : [previous];
      const clones = hasMaterial
        ? originals.map((source) => {
            const clone = source.clone() as MeshStandardMaterial;
            if (clone.color && (material?.color ?? settings.materialColor))
              clone.color.set(material?.color ?? settings.materialColor!);
            if (material?.roughness !== undefined || settings.roughness !== undefined)
              clone.roughness = material?.roughness ?? settings.roughness!;
            if (material?.metalness !== undefined || settings.metalness !== undefined)
              clone.metalness = material?.metalness ?? settings.metalness!;
            if (material) {
              clone.emissive?.set(material.emissive);
              clone.opacity = material.opacity;
              clone.transparent = material.opacity < 1;
              clone.emissiveIntensity = material.emissiveIntensity;
              clone.side = material.doubleSided ? DoubleSide : FrontSide;
              clone.normalScale?.setScalar(material.normalScale);
              const configure = (texture: Texture, slot: (typeof slots)[number]) => {
                texture.wrapS = texture.wrapT = RepeatWrapping;
                texture.repeat.fromArray(material.tiling);
                texture.offset.fromArray(material.offset);
                if (slot === "map" || slot === "emissiveMap") texture.colorSpace = SRGBColorSpace;
                texture.needsUpdate = true;
                textures.push(texture);
                clone[slot] = texture;
                clone.needsUpdate = true;
              };
              for (const slot of slots) {
                const url = material[slot];
                if (url === undefined) {
                  if (clone[slot]) configure(clone[slot]!.clone(), slot);
                  continue;
                }
                clone[slot] = null;
                if (url)
                  new TextureLoader().load(
                    url,
                    (texture) => {
                      if (disposed) {
                        texture.dispose();
                        return;
                      }
                      configure(texture, slot);
                    },
                    undefined,
                    () => console.warn("Could not load material texture", url),
                  );
              }
            }
            clone.needsUpdate = true;
            return clone;
          })
        : [];
      if (clones.length) mesh.material = Array.isArray(previous) ? clones : clones[0];
      current.set(mesh, () => {
        disposed = true;
        mesh.visible = visible;
        mesh.castShadow = cast;
        mesh.receiveShadow = receive;
        mesh.material = previous;
        clones.forEach((m) => m.dispose());
        textures.forEach((t) => t.dispose());
      });
    });
  });
  return null;
}
