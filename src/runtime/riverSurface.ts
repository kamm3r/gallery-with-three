import * as THREE from "three";
import { groundHeight, HUB_HALF, HUB_SEGS, WATER_LEVEL, waterDistance } from "../gameplay/terrain";
import { daylightAt } from "../gameplay/daylight";

function createWater() {
  const vertices: number[] = [],
    depths: number[] = [],
    indices: number[] = [];
  for (let z = 0; z <= HUB_SEGS; z++) {
    for (let x = 0; x <= HUB_SEGS; x++) {
      const wx = -HUB_HALF + (x / HUB_SEGS) * HUB_HALF * 2;
      const wz = -HUB_HALF + (z / HUB_SEGS) * HUB_HALF * 2;
      vertices.push(wx, WATER_LEVEL, wz);
      depths.push(Math.max(0, WATER_LEVEL - groundHeight(wx, wz)));
    }
  }
  for (let z = 0; z < HUB_SEGS; z++)
    for (let x = 0; x < HUB_SEGS; x++) {
      const wx = -HUB_HALF + ((x + 0.5) / HUB_SEGS) * HUB_HALF * 2;
      const wz = -HUB_HALF + ((z + 0.5) / HUB_SEGS) * HUB_HALF * 2;
      if (waterDistance(wx, wz) > 4) continue;
      const a = z * (HUB_SEGS + 1) + x,
        b = a + 1,
        c = a + HUB_SEGS + 1;
      indices.push(a, c, b, b, c, c + 1);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("waterDepth", new THREE.Float32BufferAttribute(depths, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export class RiverSurface {
  readonly time = { value: 0 };
  readonly motionTime = { value: 0 };
  readonly ripples = { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -100, 0)) };
  readonly skyColor = { value: new THREE.Color() };
  readonly daySky = new THREE.Color("#a7cddb");
  nextRipple = 0;
  readonly geometry = createWater();
  readonly material = new THREE.MeshStandardMaterial({
    color: "#328d91",
    roughness: 0.2,
    metalness: 0.12,
    transparent: true,
    opacity: 0.82,
  });
  constructor() {
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uWaterTime = this.time;
      shader.uniforms.uWaterMotion = this.motionTime;
      shader.uniforms.uContactRipples = this.ripples;
      shader.uniforms.uWaterSky = this.skyColor;
      shader.vertexShader =
        "uniform float uWaterMotion; attribute float waterDepth; varying float vWaterDepth; varying vec2 vWaterPosition;\n" +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        vWaterDepth = waterDepth;
        vWaterPosition = position.xz;
        transformed.y += sin(position.x * 1.8 + uWaterMotion) * sin(position.z * 1.4 - uWaterMotion * 1.1) * 0.035;
      `,
      );
      shader.fragmentShader =
        `uniform float uWaterTime, uWaterMotion; uniform vec4 uContactRipples[8]; uniform vec3 uWaterSky;
        varying float vWaterDepth; varying vec2 vWaterPosition;
        float contactWave(vec2 p) {
          float wave = 0.0;
          for (int i = 0; i < 8; i++) {
            float age = uWaterTime - uContactRipples[i].z;
            if (age < 0.0 || age > 2.0) continue;
            float ring = length(p - uContactRipples[i].xy) - age * 2.1;
            wave += sin(ring * 18.0) * exp(-ring * ring * 9.0) * pow(1.0-age/2.0,2.0) * uContactRipples[i].w;
          }
          return wave;
        }
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `
        #include <color_fragment>
        float ripple = sin(vWaterPosition.x * 2.4 + vWaterPosition.y * 1.7 - uWaterMotion * 1.4);
        float foam = (1.0 - smoothstep(0.1, 0.55, vWaterDepth)) * (0.7 + ripple * 0.3);
        diffuseColor.rgb = mix(diffuseColor.rgb * mix(1.3, 0.65, clamp(vWaterDepth / 2.0, 0.0, 1.0)), vec3(0.75,0.85,0.78), foam * 0.6);
        float contact = contactWave(vWaterPosition);
        diffuseColor.rgb += vec3(0.35,0.48,0.45) * max(0.0,contact);
        float caustic = pow(max(0.0, sin(vWaterPosition.x*3.4+sin(vWaterPosition.y*2.7+uWaterMotion)) * cos(vWaterPosition.y*3.1-uWaterMotion*0.6)), 8.0);
        diffuseColor.rgb += caustic * 0.12 * (1.0-smoothstep(0.3,2.0,vWaterDepth));
        diffuseColor.a = mix(0.5,0.91,smoothstep(0.0,1.8,vWaterDepth));
      `,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        `
        float fresnel = pow(1.0 - max(dot(normal, geometryViewDir), 0.0), 4.0);
        outgoingLight = mix(outgoingLight, uWaterSky, fresnel * 0.5);
        #include <opaque_fragment>
      `,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_begin>",
        `
        #include <normal_fragment_begin>
        normal = normalize(normal + vec3(sin(vWaterPosition.x*1.8+uWaterMotion), cos(vWaterPosition.y*1.4-uWaterMotion), 0.0) * 0.08);
      `,
      );
    };
    this.material.customProgramCacheKey = () => "river-contact-v2";
  }
  update(time: number, reduced: boolean) {
    this.time.value = time;
    this.motionTime.value = reduced ? 0 : time;
    this.skyColor.value.set("#101c32").lerp(this.daySky, daylightAt(time).daylight);
  }
  emit(x: number, z: number, strength: number) {
    this.ripples.value[this.nextRipple++ % 8].set(x, z, this.time.value, strength);
  }
}
