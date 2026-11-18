import * as THREE from "three";
import type { IndexedSurface } from "./residentTopology.ts";

import {
  gothicResidents,
  sculptResident,
  type Point,
  type Section,
  type Resident,
} from "./gothicResidents.ts";

export function createWayfarer(texture: THREE.Texture, resident?: Resident) {
  const root = new THREE.Group();
  root.name = "Wayfarer";
  const material = new THREE.MeshLambertMaterial({
    map: texture,
    color: 0xffffff,
    side: THREE.DoubleSide,
    vertexColors: resident !== undefined,
  });
  const geometry: THREE.BufferGeometry[] = [];

  function joint(parent: THREE.Group, name: string, position: Point = [0, 0, 0]) {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(...position);
    parent.add(group);
    return group;
  }

  // Each surface gets its own painted island in the shared atlas.
  function surface(parent: THREE.Group, tile: number, rows: Point[][]) {
    const positions = rows.flat(2);
    const columns = rows[0].length;
    const uv: number[] = [];
    const indices: number[] = [];
    const atlasColumns = resident ? 8 : 4;
    const tx = (tile % atlasColumns) * 64;
    const ty = Math.floor(tile / atlasColumns) * 64;
    for (let row = 0; row < rows.length; row++) {
      for (let col = 0; col < columns; col++) {
        uv.push(
          (tx + 2 + (col * 60) / (columns - 1)) / (atlasColumns * 64),
          1 - (ty + 62 - (row * 60) / (rows.length - 1)) / 256,
        );
        if (!row || !col) continue;
        const d = row * columns + col;
        const c = d - 1,
          b = d - columns,
          a = b - 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const meshGeometry = new THREE.BufferGeometry();
    meshGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    meshGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    meshGeometry.setIndex(indices);
    meshGeometry.computeVertexNormals();
    if (resident) {
      // UV shells leave duplicate vertices at the seam. Share their normals so a
      // garment can turn away from the light without a hard stripe at the join.
      const normals = meshGeometry.getAttribute("normal");
      const position = meshGeometry.getAttribute("position");
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      for (let row = 0; row < rows.length; row++) {
        const first = row * columns;
        const last = first + columns - 1;
        a.fromBufferAttribute(position, first);
        b.fromBufferAttribute(position, last);
        if (a.distanceToSquared(b) > 1e-9) continue;
        a.fromBufferAttribute(normals, first).add(b.fromBufferAttribute(normals, last)).normalize();
        normals.setXYZ(first, a.x, a.y, a.z);
        normals.setXYZ(last, a.x, a.y, a.z);
      }
    }
    geometry.push(meshGeometry);
    const mesh = new THREE.Mesh(meshGeometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
  }

  function garment(
    parent: THREE.Group,
    tile: number,
    profile: Section[],
    sides = 10,
    shape?: (point: Point, angle: number, row: number) => Point,
  ) {
    surface(
      parent,
      tile,
      profile.map(([y, width, depth, x = 0, z = 0], row) =>
        Array.from({ length: sides + 1 }, (_, col) => {
          const angle = (col / sides - 0.5) * Math.PI * 2;
          const point: Point = [x + Math.sin(angle) * width, y, z + Math.cos(angle) * depth];
          return shape?.(point, angle, row) ?? point;
        }),
      ),
    );
  }

  function indexed(parent: THREE.Group, tile: number, { points, uv, indices }: IndexedSurface) {
    const tx = (tile % 8) * 64;
    const ty = Math.floor(tile / 8) * 64;
    const mappedUv = uv.flatMap(([u, v]) => [
      (tx + 2 + 60 * u) / 512,
      1 - (ty + 62 - 60 * v) / 256,
    ]);
    const authored = new THREE.BufferGeometry();
    authored.setAttribute("position", new THREE.Float32BufferAttribute(points.flat(), 3));
    authored.setAttribute("uv", new THREE.Float32BufferAttribute(mappedUv, 2));
    authored.setIndex(indices);
    authored.computeVertexNormals();
    geometry.push(authored);
    const model = new THREE.Mesh(authored, material);
    model.castShadow = model.receiveShadow = true;
    parent.add(model);
  }

  if (resident) {
    root.name = gothicResidents[resident].name;
    const joints = sculptResident(root, resident, { joint, garment, surface, indexed });
    // Bake a little fill and ground contact into the vertex colors. The cast
    // retains some depth even when the scene's main light is disabled.
    root.updateMatrixWorld(true);
    const point = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3();
    const stature = gothicResidents[resident].height;
    root.traverse((item) => {
      if (!(item instanceof THREE.Mesh)) return;
      const positions = item.geometry.getAttribute("position");
      const normals = item.geometry.getAttribute("normal");
      const colors = new Float32Array(positions.count * 3);
      normalMatrix.getNormalMatrix(item.matrixWorld);
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(item.matrixWorld);
        normal.fromBufferAttribute(normals, i).applyNormalMatrix(normalMatrix);
        const ground = THREE.MathUtils.smoothstep(point.y, 0.035, 0.34);
        const top = THREE.MathUtils.smoothstep(point.y, stature * 0.4, stature);
        const shelf = THREE.MathUtils.smoothstep(normal.y, -0.76, 0.38);
        const cavity = 1 - 0.11 * (1 - shelf) * (1 - ground * 0.48);
        colors[i * 3] = (0.79 + 0.14 * ground + 0.066 * top) * cavity;
        colors[i * 3 + 1] = (0.79 + 0.15 * ground + 0.055 * top) * cavity;
        colors[i * 3 + 2] = (0.82 + 0.13 * ground + 0.05 * top) * cavity;
      }
      item.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    });
    return {
      root,
      joints,
      dispose() {
        geometry.forEach((item) => item.dispose());
        material.dispose();
      },
    };
  }

  const body = joint(root, "body");
  const head = joint(body, "head", [0.012, 1.5, 0.051]);
  const scarf = joint(body, "scarf", [0, 1.47, 0.11]);

  for (const side of [-1, 1]) {
    garment(
      root,
      2,
      [
        [0.17, 0.057, 0.061, side * 0.121],
        [0.3, 0.076, 0.081, side * 0.119],
        [0.44, 0.093, 0.103, side * 0.111, 0.025],
        [0.52, 0.098, 0.092, side * 0.11],
        [0.7, 0.111, 0.108, side * 0.108],
        [0.91, 0.119, 0.12, side * 0.105],
      ],
      10,
    );
    garment(
      root,
      3,
      [
        [0.005, 0.005, 0.008, side * 0.122, 0.04],
        [0.022, 0.088, 0.151, side * 0.122, 0.053],
        [0.07, 0.089, 0.15, side * 0.122, 0.054],
        [0.117, 0.083, 0.12, side * 0.122, 0.027],
        [0.153, 0.075, 0.085, side * 0.122],
        [0.253, 0.081, 0.089, side * 0.119],
        [0.28, 0.085, 0.091, side * 0.119],
        [0.29, 0.083, 0.09, side * 0.119],
      ],
      10,
      ([x, y, z], angle) => [x + side * Math.max(0, Math.cos(angle)) * 0.026, y, z],
    );
    garment(
      root,
      8,
      [
        [0.21, 0.082, 0.09, side * 0.12],
        [0.237, 0.085, 0.094, side * 0.12],
      ],
      10,
    );
  }

  garment(
    body,
    1,
    [
      [0.87, 0.244, 0.156],
      [0.9, 0.245, 0.156],
      [0.94, 0.239, 0.151],
      [0.98, 0.228, 0.145],
      [1.1, 0.243, 0.16],
      [1.25, 0.29, 0.167],
      [1.385, 0.303, 0.15],
      [1.46, 0.205, 0.116],
      [1.515, 0.1, 0.093],
    ],
    14,
    ([x, y, z], angle, row) => {
      const fold = row < 5 ? Math.cos(angle * 5) * 0.012 + Math.sin(angle * 3) * 0.009 : 0;
      return [
        x + Math.sin(angle) * fold,
        y + (row < 2 ? Math.sin(angle * 2) * 0.035 + Math.max(0, Math.cos(angle)) * 0.017 : 0),
        z + Math.cos(angle) * fold,
      ];
    },
  );
  // Separate coat panels leave a slit over the knees and break up the back hem.
  const coat: Section[] = [
    [0.39, 0.325, 0.22, 0, -0.055],
    [0.5, 0.296, 0.203, 0, -0.038],
    [0.65, 0.274, 0.187, 0, -0.024],
    [0.81, 0.251, 0.169, 0, -0.009],
    [0.965, 0.239, 0.157],
  ];
  for (const side of [-1, 1]) {
    surface(
      body,
      12,
      coat.map(([y, w, d, , offset = 0], row) =>
        Array.from({ length: 10 }, (_, column): Point => {
          const progress = (side === 1 ? column : 9 - column) / 9;
          const angle =
            side * (0.12 + (1 - row / 4) * 0.26 + progress * (2.98 - (1 - row / 4) * 0.35));
          const folds = Math.sin(progress * Math.PI * 7) * (0.016 - row * 0.003);
          const hem =
            row < 2 ? Math.sin(progress * 11 + side) * 0.036 + (side === 1 ? 0.045 : 0) : 0;
          return [Math.sin(angle) * (w + folds), y + hem, Math.cos(angle) * (d + folds) + offset];
        }),
      ),
    );
  }
  garment(
    body,
    8,
    [
      [0.92, 0.246, 0.163],
      [0.99, 0.239, 0.157],
    ],
    14,
  );
  garment(
    joint(body, "buckle", [0.024, 0.955, 0.162]),
    9,
    [
      [-0.037, 0.038, 0.019],
      [0.036, 0.038, 0.019],
    ],
    6,
  );
  garment(
    joint(body, "pouch", [0.233, 0.88, 0.042]),
    7,
    [
      [-0.13, 0.022, 0.025],
      [-0.1, 0.076, 0.07],
      [0.015, 0.081, 0.073],
      [0.072, 0.068, 0.058],
      [0.087, 0.018, 0.022],
    ],
    8,
  );
  garment(
    joint(body, "map satchel", [-0.15, 1.03, -0.19]),
    11,
    [
      [-0.2, 0.077, 0.046],
      [-0.155, 0.137, 0.083],
      [0.125, 0.15, 0.089],
      [0.184, 0.126, 0.062],
      [0.2, 0.077, 0.043],
    ],
    8,
  );

  const lantern = joint(body, "belt lantern", [-0.276, 0.77, 0.081]);
  lantern.rotation.set(-0.09, 0.2, -0.13);
  garment(
    lantern,
    9,
    [
      [-0.066, 0.031, 0.031],
      [-0.057, 0.048, 0.048],
      [-0.041, 0.043, 0.043],
    ],
    6,
  );
  garment(
    lantern,
    9,
    [
      [0.042, 0.043, 0.043],
      [0.056, 0.049, 0.049],
      [0.077, 0.026, 0.026],
      [0.083, 0.004, 0.004],
    ],
    6,
  );
  const glassMaterial = new THREE.MeshLambertMaterial({
    color: 0xc38546,
    emissive: 0x9a461d,
    emissiveIntensity: 0.62,
  });
  const glass = new THREE.CylinderGeometry(0.034, 0.034, 0.093, 6);
  geometry.push(glass);
  lantern.add(new THREE.Mesh(glass, glassMaterial));
  const frame = new THREE.BoxGeometry(0.006, 0.108, 0.006);
  geometry.push(frame);
  const frameUv = frame.getAttribute("uv");
  for (let k = 0; k < frameUv.count; k++) frameUv.setXY(k, 0.311, 0.427);
  for (let bar = 0; bar < 6; bar++) {
    const a = (bar * Math.PI) / 3;
    const spoke = new THREE.Mesh(frame, material);
    spoke.position.set(Math.sin(a) * 0.039, 0, Math.cos(a) * 0.039);
    lantern.add(spoke);
  }
  garment(
    lantern,
    8,
    [
      [0.075, 0.012, 0.011],
      [0.182, 0.012, 0.011],
    ],
    6,
  );

  // Shoulder to wrist stays continuous. Each arm pivots just inside the mantle.
  const arms: Record<string, THREE.Group> = {};
  for (const side of [-1, 1]) {
    const arm = joint(body, "arm" + side, [side * 0.269, 1.363, 0]);
    arms[arm.name] = arm;
    garment(
      arm,
      4,
      [
        [-0.48, 0.055, 0.057, side * 0.115, 0.066],
        [-0.4, 0.064, 0.068, side * 0.102, 0.038],
        [-0.29, 0.085, 0.08, side * 0.092, 0.005],
        [-0.23, 0.079, 0.075, side * 0.092, -0.009],
        [-0.164, 0.094, 0.088, side * 0.087],
        [-0.08, 0.119, 0.109, side * 0.054],
        [0.005, 0.109, 0.103, side * 0.015],
        [0.054, 0.071, 0.074],
        [0.056, 0.01, 0.01],
      ],
      10,
    );
    garment(
      arm,
      8,
      [
        [-0.496, 0.057, 0.059, side * 0.115, 0.066],
        [-0.447, 0.063, 0.066, side * 0.112, 0.062],
      ],
      10,
    );
    const hand = joint(arm, "glove", [side * 0.115, -0.49, 0.074]);
    garment(
      hand,
      7,
      [
        [-0.123, 0.009, 0.013, -side * 0.008, 0.029],
        [-0.109, 0.031, 0.04, -side * 0.005, 0.027],
        [-0.075, 0.053, 0.052, -side * 0.005, 0.023],
        [-0.037, 0.061, 0.047, -side * 0.009, 0.011],
        [0.009, 0.045, 0.048],
      ],
      8,
    );
    garment(
      joint(hand, "thumb", [-side * 0.043, -0.041, 0.024]),
      7,
      [
        [-0.052, 0.008, 0.008, -side * 0.012, 0.016],
        [-0.035, 0.025, 0.025, -side * 0.008, 0.012],
        [0.018, 0.027, 0.027],
      ],
      6,
    );
  }

  garment(
    body,
    5,
    [
      [1.23, 0.393, 0.229],
      [1.29, 0.432, 0.226],
      [1.36, 0.431, 0.198],
      [1.44, 0.32, 0.164],
      [1.52, 0.136, 0.112],
      [1.563, 0.112, 0.106],
    ],
    18,
    ([x, y, z], angle, row) => {
      const asymmetry = row < 3 ? Math.sin(angle) * 0.064 : 0;
      const front = Math.max(0, Math.cos(angle));
      return [
        x,
        y + asymmetry + front * (row === 0 ? 0.12 : row === 1 ? 0.055 : 0),
        z + (row < 3 ? 0.019 * Math.cos(angle * 6) : 0),
      ];
    },
  );
  garment(
    body,
    6,
    [
      [1.425, 0.139, 0.121],
      [1.462, 0.159, 0.134],
      [1.534, 0.143, 0.152],
      [1.61, 0.123, 0.124],
    ],
    12,
    ([x, y, z], angle, row) => [x, y - (row === 3 ? Math.max(0, Math.cos(angle)) * 0.07 : 0), z],
  );
  surface(scarf, 6, [
    [
      [-0.045, -0.377, 0.057],
      [0.027, -0.396, 0.036],
      [0.061, -0.374, 0.021],
    ],
    [
      [-0.081, -0.264, 0.077],
      [-0.003, -0.273, 0.084],
      [0.06, -0.238, 0.066],
    ],
    [
      [-0.148, -0.105, 0.054],
      [-0.082, -0.122, 0.082],
      [-0.028, -0.104, 0.069],
    ],
    [
      [-0.132, 0.003, 0.007],
      [-0.062, 0.024, 0.045],
      [-0.019, 0.018, 0.033],
    ],
  ]);
  garment(
    joint(body, "mantle clasp", [-0.136, 1.43, 0.137]),
    9,
    [
      [-0.037, 0.034, 0.022],
      [0.032, 0.036, 0.021],
    ],
    8,
  );

  // Front facial grid has distinct chin, lips, cheeks, nose and brow in profile.
  const faceRows: [number, number, number[]][] = [
    [0.012, 0.061, [0.065, 0.094, 0.107, 0.111, 0.107, 0.094, 0.065]],
    [0.042, 0.081, [0.072, 0.111, 0.128, 0.132, 0.128, 0.111, 0.072]],
    [0.071, 0.093, [0.078, 0.126, 0.138, 0.137, 0.138, 0.126, 0.078]],
    [0.096, 0.098, [0.076, 0.129, 0.125, 0.146, 0.125, 0.129, 0.076]],
    [0.123, 0.1, [0.075, 0.133, 0.123, 0.179, 0.123, 0.133, 0.075]],
    [0.151, 0.101, [0.071, 0.121, 0.106, 0.154, 0.106, 0.121, 0.071]],
    [0.177, 0.106, [0.072, 0.128, 0.126, 0.136, 0.126, 0.128, 0.072]],
    [0.207, 0.101, [0.081, 0.125, 0.13, 0.133, 0.13, 0.125, 0.081]],
    [0.235, 0.087, [0.065, 0.104, 0.119, 0.124, 0.119, 0.104, 0.065]],
  ];
  surface(
    head,
    0,
    faceRows.map(([y, w, depth]) => depth.map((z, col): Point => [(col / 3 - 1) * w, y, z])),
  );
  // A worn linen wrap follows the jaw, tucked into the hood at either side.
  surface(
    head,
    13,
    faceRows.slice(0, 4).map(([y, width, depth], row) =>
      depth.map((z, col): Point => {
        const across = col / 3 - 1;
        return [across * width * 1.08, y + (row === 3 ? across * 0.014 : 0), z + 0.006];
      }),
    ),
  );
  // Radial rows travel from the opening inward around the skull.
  const hood: [number, number, number, number][] = [
    [0.091, 0.119, 0.093, 0.128],
    [0.103, 0.134, 0.125, 0.141],
    [0.139, 0.161, 0.136, 0.109],
    [0.153, 0.174, 0.144, 0.039],
    [0.141, 0.156, 0.149, -0.077],
    [0.105, 0.122, 0.155, -0.129],
    [0.051, 0.081, 0.159, -0.158],
    [0.001, 0.001, 0.152, -0.166],
  ];
  surface(
    head,
    10,
    hood.map(([w, h, cy, z], row) =>
      Array.from({ length: 21 }, (_, col): Point => {
        const a = (col / 20 - 0.5) * Math.PI * 2;
        const peak = Math.max(0, Math.cos(a));
        return [
          Math.sin(a) * w + row * 0.003,
          cy + Math.cos(a) * h + peak ** 5 * (row < 5 ? 0.051 : 0.014),
          z - (row < 4 ? Math.abs(Math.sin(a)) * 0.049 : 0),
        ];
      }),
    ),
  );

  const joints: Record<string, THREE.Group> = { body, head, scarf, ...arms };
  return {
    root,
    joints,
    dispose() {
      geometry.forEach((item) => item.dispose());
      material.dispose();
      glassMaterial.dispose();
    },
  };
}
