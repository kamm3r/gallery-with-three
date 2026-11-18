import * as THREE from "three";
import type { TerrainGrid } from "../gameplay/terrain";

// Forest-floor brushwork: two octaves of world-space value noise mottle the
// baked terrain colours with moss, damp soil and warm leaf litter, so the
// ground reads as painted texture rather than flat vertex colour.
function createGroundMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "varying vec2 vGroundXZ;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n vGroundXZ = position.xz;",
      );
    shader.fragmentShader =
      `varying vec2 vGroundXZ;
      float groundHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float groundNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(groundHash(i), groundHash(i + vec2(1, 0)), f.x),
          mix(groundHash(i + vec2(0, 1)), groundHash(i + vec2(1, 1)), f.x), f.y);
      }\n` +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float broad = groundNoise(vGroundXZ * 0.35);
        float fine = groundNoise(vGroundXZ * 2.3 + 7.0);
        diffuseColor.rgb *= 0.78 + fine * 0.34;
        vec3 litter = diffuseColor.rgb * vec3(1.45, 1.05, 0.62);
        vec3 moss = diffuseColor.rgb * vec3(0.8, 1.12, 0.7);
        diffuseColor.rgb = mix(diffuseColor.rgb, litter, smoothstep(0.55, 0.8, broad) * 0.7);
        diffuseColor.rgb = mix(diffuseColor.rgb, moss, smoothstep(0.45, 0.2, broad) * 0.6);`,
      );
  };
  material.customProgramCacheKey = () => "hub-ground-v1";
  return material;
}

export function createHubGround(grid: TerrainGrid) {
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(grid.indices);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(grid.vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(grid.colors, 3));
  geometry.computeVertexNormals();
  const ground = new THREE.Mesh(geometry, createGroundMaterial());
  ground.receiveShadow = true;
  return ground;
}
