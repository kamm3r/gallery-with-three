import * as THREE from "three";
import { capitalStatueData, capitalPaintData } from "./generated/capitalStatueData.ts";

/** Static authored meshes; decode once, then give each kit instance its own geometry. */
const decoded = new Map<
  string,
  {
    position: Float32Array;
    normal: Float32Array;
    color: Float32Array;
    index: Uint16Array;
    uv: Float32Array | null;
  }
>();
const bytes = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

export function capitalStatueGeometry(
  model: "sentinel-statue" | "equestrian-statue",
  [w, h, d]: readonly [number, number, number],
) {
  const key = model === "sentinel-statue" ? "sentinel" : "mounted";
  const source = capitalStatueData[key];
  let data = decoded.get(key);
  if (!data) {
    const positions = new DataView(bytes(source.position).buffer);
    const normal = new Int8Array(bytes(source.normal).buffer);
    const color = bytes(source.color);
    const indices = new DataView(bytes(source.index).buffer);
    const uv = "uv" in source ? new DataView(bytes(source.uv).buffer) : null;
    data = {
      position: Float32Array.from(
        { length: source.vertices * 3 },
        (_, i) => positions.getInt16(i * 2, true) / 16384,
      ),
      normal: Float32Array.from(normal, (n) => n / 127),
      color: Float32Array.from(color, (n) => n / 255),
      uv: uv
        ? Float32Array.from(
            { length: source.vertices * 2 },
            (_, i) => uv.getUint16(i * 2, true) / 65535,
          )
        : null,
      index: Uint16Array.from({ length: source.triangles * 3 }, (_, i) =>
        indices.getUint16(i * 2, true),
      ),
    };
    decoded.set(key, data);
  }
  // Fit uniformly: stretching a human or horse independently per axis destroys its anatomy.
  const scale = Math.min(h, w / source.width, d / source.depth);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(data.position.slice(), 3));
  g.setAttribute("normal", new THREE.BufferAttribute(data.normal.slice(), 3));
  g.setAttribute("color", new THREE.BufferAttribute(data.color.slice(), 3));
  g.setAttribute(
    "uv",
    new THREE.BufferAttribute(data.uv?.slice() ?? new Float32Array(source.vertices * 2), 2),
  );
  if (data.uv) g.userData.authoredUv = true;
  g.setIndex(new THREE.BufferAttribute(data.index.slice(), 1));
  g.scale(scale, scale, scale);
  g.normalizeNormals();
  return g;
}

/** Decode the sculpt's four-view, 256-colour atlas without a browser image-load dependency. */
export function capitalStatueTexture() {
  const indices = bytes(capitalPaintData.indices),
    palette = bytes(capitalPaintData.palette);
  const rgba = new Uint8Array(indices.length * 4);
  for (let i = 0; i < indices.length; i++) {
    const p = indices[i] * 3;
    rgba.set([palette[p], palette[p + 1], palette[p + 2], 255], i * 4);
  }
  const texture = new THREE.DataTexture(rgba, capitalPaintData.size, capitalPaintData.size);
  texture.name = "Hollow Marshal painted atlas";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
