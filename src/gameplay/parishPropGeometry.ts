import * as THREE from "three";
import { parishCanopy, type DressingPoint } from "./parishDressingPlan.ts";

/** Small shared procedural maps; no asset fetches or per-frame canvas work. */
export function createParishPropTexture(kind: "wood" | "cloth") {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  let seed = 31047;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  ctx.fillStyle = kind === "wood" ? "#ddc8a6" : "#dfd1b7";
  ctx.fillRect(0, 0, 256, 256);
  if (kind === "wood") {
    for (let i = 0; i < 190; i++) {
      const x = random() * 256,
        phase = random() * Math.PI * 2;
      ctx.strokeStyle = i % 3 === 0 ? "#725e3a55" : "#f8ecc645";
      ctx.lineWidth = 0.4 + random() * 1.4;
      ctx.beginPath();
      for (let y = 0; y <= 256; y += 8) {
        const px = x + Math.sin(y * 0.024 + phase) * 2.5 + Math.sin(y * 0.09 + phase) * 0.5;
        if (y === 0) ctx.moveTo(px, y);
        else ctx.lineTo(px, y);
      }
      ctx.stroke();
    }
    for (const [x, y] of [
      [53, 94],
      [178, 207],
    ]) {
      for (let i = 1; i <= 4; i++) {
        ctx.strokeStyle = "#75603d55";
        ctx.beginPath();
        ctx.ellipse(x, y, i * 1.8, i * 6, 0.1, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  } else {
    for (const x of [24, 88, 152, 216]) {
      ctx.fillStyle = "#fbefd2aa";
      ctx.fillRect(x, 0, 19, 256);
      ctx.fillStyle = "#77624a44";
      ctx.fillRect(x - 2, 0, 2, 256);
    }
    for (let i = 0; i < 256; i += 2) {
      ctx.fillStyle = "#f9f0d827";
      ctx.fillRect(i, 0, 1, 256);
      ctx.fillStyle = "#66523c20";
      ctx.fillRect(0, i, 256, 1);
    }
    ctx.strokeStyle = "#fff3d888";
    ctx.setLineDash([2, 3]);
    for (const y of [7, 249]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
  }
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = random() > 0.5 ? "#fff4dd24" : "#5e4f3924";
    ctx.fillRect(random() * 256, random() * 256, 1, kind === "wood" ? 5 : 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

export function createParishDoor(materials: {
  wood: THREE.Material;
  lightWood: THREE.Material;
  iron: THREE.Material;
  recess: THREE.Material;
}) {
  const root = new THREE.Group();
  root.name = "refuge-arched-door";
  const width = 2.18,
    openingWidth = 2.4,
    height = 4,
    base = 0.09;
  const top = (x: number) => {
    // Follow the actual stone opening with a small reveal, rather than scaling
    // a narrower arch and leaving wide gaps around its shoulders.
    const t = Math.sqrt(Math.max(0, 1 - Math.abs(x) / (openingWidth / 2)));
    return height * (0.64 + 0.48 * t - 0.12 * t * t) - 0.1;
  };
  const plank = (left: number, right: number, depth: number, material: THREE.Material) => {
    const shape = new THREE.Shape();
    shape.moveTo(left, base);
    shape.lineTo(right, base);
    for (let i = 0; i <= 8; i++) {
      const x = right + ((left - right) * i) / 8;
      shape.lineTo(x, top(x));
    }
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.006,
      bevelSegments: 1,
    });
    geometry.translate(0, 0, -depth / 2);
    const positions = geometry.getAttribute("position"),
      uv = geometry.getAttribute("uv");
    for (let i = 0; i < positions.count; i++)
      uv.setXY(i, (positions.getX(i) + width / 2) / width, positions.getY(i) / height);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const backing = plank(-width / 2, width / 2, 0.035, materials.recess);
  backing.position.z = 0.075;
  for (let i = 0; i < 8; i++) {
    const left = -width / 2 + (i * width) / 8 + 0.009,
      right = -width / 2 + ((i + 1) * width) / 8 - 0.009;
    plank(left, right, 0.14, i % 3 === 1 ? materials.lightWood : materials.wood);
  }
  const cube = new THREE.BoxGeometry(1, 1, 1),
    stud = new THREE.SphereGeometry(0.026, 6, 4),
    ring = new THREE.TorusGeometry(0.075, 0.016, 5, 12);
  const box = (at: DressingPoint, size: DressingPoint, material = materials.iron) => {
    const mesh = new THREE.Mesh(cube, material);
    mesh.position.set(...at);
    mesh.scale.set(...size);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
  };
  for (const side of [-1, 1]) {
    for (const y of [0.8, 2.1]) {
      box([side * 0.56, y, -0.098], [0.94, 0.085, 0.04]);
      box([side * 1.04, y, -0.095], [0.09, 0.25, 0.055]);
      for (const offset of [0.17, 0.52, 0.94]) {
        const nail = new THREE.Mesh(stud, materials.iron);
        nail.position.set(side * offset, y, -0.125);
        root.add(nail);
      }
    }
    box([side * 0.16, 1.5, -0.105], [0.13, 0.19, 0.04]);
    const handle = new THREE.Mesh(ring, materials.iron);
    handle.position.set(side * 0.16, 1.43, -0.145);
    handle.castShadow = true;
    root.add(handle);
  }
  return root;
}

export function createParishCanopy(materials: {
  wood: THREE.Material;
  iron: THREE.Material;
  cloth: THREE.Material;
}) {
  const root = new THREE.Group();
  root.name = "refuge-market-canopy";
  root.position.set(...parishCanopy.position);
  const { width, depth, rearHeight, frontHeight } = parishCanopy;
  const cube = new THREE.BoxGeometry(1, 1, 1),
    up = new THREE.Vector3(0, 1, 0);
  const box = (at: DressingPoint, size: DressingPoint, material = materials.wood) => {
    const mesh = new THREE.Mesh(cube, material);
    mesh.position.set(...at);
    mesh.scale.set(...size);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const beam = (a: DressingPoint, b: DressingPoint, thickness: number) => {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      delta = end.clone().sub(start);
    const mesh = box(start.add(end).multiplyScalar(0.5).toArray() as DressingPoint, [
      thickness,
      delta.length(),
      thickness,
    ]);
    mesh.quaternion.setFromUnitVectors(up, delta.normalize());
  };
  for (const side of [-1, 1]) {
    const x = (side * width) / 2;
    for (const end of [-1, 1]) {
      const z = (end * depth) / 2,
        h = end === -1 ? rearHeight : frontHeight;
      box([x, h / 2, z], [0.18, h, 0.18]).name = "canopy-post";
      box([x, 0.04, z], [0.26, 0.08, 0.26], materials.iron);
      box([x, h - 0.12, z], [0.2, 0.09, 0.2], materials.iron);
      beam([x, h - 0.7, z], [x - side * 0.7, h, z], 0.095);
    }
    beam([x, rearHeight, -depth / 2], [x, frontHeight, depth / 2], 0.12);
  }
  for (const end of [-1, 1]) {
    const h = end === -1 ? rearHeight : frontHeight;
    box([0, h - 0.065, (end * depth) / 2], [width + 0.2, 0.13, 0.16]);
  }
  const geometry = new THREE.PlaneGeometry(width, depth, 24, 12);
  geometry.rotateX(-Math.PI / 2);
  const p = geometry.getAttribute("position"),
    weights = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / width + 0.5,
      v = p.getZ(i) / depth + 0.5,
      tension = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
    p.setY(
      i,
      rearHeight +
        (frontHeight - rearHeight) * v -
        tension * 0.28 +
        Math.sin(u * Math.PI * 14) * tension * 0.035,
    );
    weights[i] = Math.max(0, tension);
  }
  geometry.setAttribute("parishClothWeight", new THREE.BufferAttribute(weights, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.boundingBox!.expandByScalar(0.12);
  geometry.boundingSphere = geometry.boundingBox!.getBoundingSphere(new THREE.Sphere());
  const roof = new THREE.Mesh(geometry, materials.cloth);
  roof.name = "canopy-fabric";
  roof.castShadow = roof.receiveShadow = true;
  root.add(roof);

  const hemGeometry = new THREE.PlaneGeometry(width, 0.23, 24, 1),
    hemPositions = hemGeometry.getAttribute("position"),
    hemWeights = new Float32Array(hemPositions.count);
  for (let i = 0; i < hemPositions.count; i++) {
    const u = hemPositions.getX(i) / width + 0.5,
      free = hemPositions.getY(i) < 0 ? 1 : 0;
    hemPositions.setY(i, frontHeight - free * (0.2 + Math.abs(Math.sin(u * Math.PI * 8)) * 0.07));
    hemPositions.setZ(i, depth / 2 + 0.012);
    hemWeights[i] = free * Math.sin(Math.PI * u);
  }
  hemGeometry.setAttribute("parishClothWeight", new THREE.BufferAttribute(hemWeights, 1));
  hemGeometry.computeVertexNormals();
  hemGeometry.computeBoundingBox();
  hemGeometry.boundingBox!.expandByScalar(0.12);
  hemGeometry.boundingSphere = hemGeometry.boundingBox!.getBoundingSphere(new THREE.Sphere());
  const hem = new THREE.Mesh(hemGeometry, materials.cloth);
  hem.name = "canopy-scalloped-hem";
  hem.receiveShadow = true;
  root.add(hem);
  return root;
}
