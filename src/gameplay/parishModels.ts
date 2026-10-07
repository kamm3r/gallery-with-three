import * as THREE from "three";
import { batchJointMeshes } from "./batchJointMeshes.ts";
import type { EnemyKind } from "./ashenParish";

export type ParishRig = {
  root: THREE.Group;
  joints: Record<string, THREE.Group>;
  dispose: () => void;
};

/** Authored silhouettes with shoulder/elbow, hip/knee and jaw articulation. */
export function createParishRig(kind: EnemyKind, batch = true): ParishRig {
  const root = new THREE.Group();
  root.name = `parish-${kind}-model`;
  const joints: Record<string, THREE.Group> = {};
  const iron = new THREE.MeshStandardMaterial({
    color: "#777e7d",
    metalness: 0.68,
    roughness: 0.67,
  });
  const dark = new THREE.MeshStandardMaterial({ color: "#20282b", roughness: 0.96 });
  const bone = new THREE.MeshStandardMaterial({ color: "#b7ac94", roughness: 0.86 });
  const cloth = new THREE.MeshStandardMaterial({
    color: kind === "acolyte" ? "#454653" : "#654638",
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: "#a18b60",
    metalness: 0.65,
    roughness: 0.65,
  });
  const ember = new THREE.MeshStandardMaterial({
    color: "#ffcd94",
    emissive: "#e8793a",
    emissiveIntensity: 2.5,
  });
  // Colour lives in vertices, allowing each joint to share just three
  // surfaces: weathered metal, matte cloth/bone, and the ember accents.
  const metalSurface = iron.clone();
  metalSurface.color.set("white");
  metalSurface.vertexColors = true;
  const matteSurface = dark.clone();
  matteSurface.color.set("white");
  matteSurface.vertexColors = true;
  matteSurface.side = THREE.DoubleSide;
  function joint(name: string, parent: THREE.Group, at: [number, number, number]) {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(...at);
    parent.add(group);
    joints[name] = group;
    return group;
  }
  function mesh(
    parent: THREE.Group,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    at: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
  ) {
    let surface = material;
    if (material instanceof THREE.MeshStandardMaterial && material !== ember) {
      const colours = new Float32Array(geometry.getAttribute("position").count * 3);
      for (let i = 0; i < colours.length; i += 3) material.color.toArray(colours, i);
      geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
      surface = material.metalness > 0.5 ? metalSurface : matteSurface;
    }
    const object = new THREE.Mesh(geometry, surface);
    object.position.set(...at);
    object.scale.set(...scale);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  const box = (
    p: THREE.Group,
    size: [number, number, number],
    at: [number, number, number],
    m: THREE.Material,
  ) => mesh(p, new THREE.BoxGeometry(...size), m, at);
  const oval = (
    p: THREE.Group,
    size: [number, number, number],
    at: [number, number, number],
    m: THREE.Material,
  ) => mesh(p, new THREE.SphereGeometry(1, 10, 7), m, at, size);
  const taper = (
    p: THREE.Group,
    top: number,
    bottom: number,
    height: number,
    at: [number, number, number],
    m: THREE.Material,
    scale: [number, number, number] = [1, 1, 1],
  ) => mesh(p, new THREE.CylinderGeometry(top, bottom, height, 10), m, at, scale);
  function plate(
    p: THREE.Group,
    points: [number, number][],
    depth: number,
    at: [number, number, number],
    m: THREE.Material,
  ) {
    const shape = new THREE.Shape();
    points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    return mesh(p, g, m, at);
  }
  function limb(
    name: string,
    parent: THREE.Group,
    at: [number, number, number],
    length: number,
    radius: number,
    m: THREE.Material,
    bendName: string,
    lowerLength: number,
  ) {
    const upper = joint(name, parent, at);
    taper(upper, radius, radius * 0.7, length, [0, -length / 2, 0], m);
    const bend = joint(bendName, upper, [0, -length, 0]);
    oval(bend, [radius * 0.83, radius * 0.8, radius * 0.83], [0, 0, 0], dark);
    taper(bend, radius * 0.7, radius * 0.48, lowerLength, [0, -lowerLength / 2, 0], m);
    return { upper, bend };
  }
  if (kind === "hound") {
    const body = joint("body", root, [0, 0.83, 0]);
    // A low canine silhouette: narrow waist, high withers, long muzzle, no antlers.
    oval(body, [0.28, 0.32, 0.79], [0, -0.03, -0.15], dark);
    oval(body, [0.39, 0.46, 0.38], [0, 0.12, 0.39], dark);
    oval(body, [0.29, 0.31, 0.3], [0, -0.04, -0.66], dark);
    for (const z of [-0.4, -0.16, 0.08, 0.3]) {
      const rib = mesh(
        body,
        new THREE.TorusGeometry(0.3, 0.027, 4, 10, Math.PI * 1.6),
        bone,
        [0, 0.03, z],
        [1, 1.1, 1],
      );
      rib.rotation.z = Math.PI * 0.7;
      oval(body, [0.05, 0.045, 0.075], [0, 0.4, z], bone);
    }
    const head = joint("head", body, [0, 0.25, 0.68]);
    oval(head, [0.22, 0.23, 0.31], [0, 0.04, 0.13], bone);
    oval(head, [0.15, 0.11, 0.35], [0, -0.06, 0.42], bone);
    box(head, [0.2, 0.1, 0.12], [0, -0.04, 0.72], dark);
    const jaw = joint("jaw", head, [0, -0.12, 0.22]);
    oval(jaw, [0.14, 0.05, 0.29], [0, -0.025, 0.27], bone);
    for (const side of [-1, 1]) {
      oval(head, [0.035, 0.026, 0.035], [side * 0.2, 0.1, 0.29], ember);
      const ear = mesh(
        head,
        new THREE.ConeGeometry(0.1, 0.25, 5),
        dark,
        [side * 0.19, 0.27, -0.03],
        [0.7, 1, 1],
      );
      ear.rotation.z = side * -0.3;
      for (const z of [0.37, 0.52, 0.63])
        mesh(head, new THREE.ConeGeometry(0.018, 0.075, 4), bone, [
          side * 0.11,
          -0.145,
          z,
        ]).rotation.z = Math.PI;
    }
    for (const [name, x, z] of [
      ["FL", -0.29, 0.44],
      ["FR", 0.29, 0.44],
      ["BL", -0.25, -0.63],
      ["BR", 0.25, -0.63],
    ] as const) {
      const { upper, bend } = limb(
        `leg${name}`,
        body,
        [x, -0.1, z],
        0.33,
        0.078,
        dark,
        `knee${name}`,
        0.37,
      );
      oval(upper, [0.12, 0.21, 0.13], [0, -0.1, 0], dark);
      const paw = joint(`foot${name}`, bend, [0, -0.37, 0.06]);
      oval(paw, [0.105, 0.055, 0.17], [0, -0.04, 0.045], dark);
      for (const dx of [-0.045, 0.045]) box(paw, [0.025, 0.025, 0.08], [dx, -0.04, 0.18], bone);
    }
    const tail = joint("tail", body, [0, 0.05, -0.94]);
    const tailMesh = taper(tail, 0.018, 0.075, 0.75, [0, -0.1, -0.34], dark);
    tailMesh.rotation.x = Math.PI / 2 + 0.3;
  } else {
    const sentinel = kind === "sentinel";
    const body = joint("body", root, [0, 1.03, 0]);
    // Waist and ribcage taper instead of stacking oversized primitive shapes.
    taper(body, 0.33, 0.25, 0.55, [0, 0.3, 0], dark, [1.15, 1, 0.75]);
    if (sentinel) {
      mesh(
        body,
        new THREE.LatheGeometry(
          [
            new THREE.Vector2(0.26, 0),
            new THREE.Vector2(0.37, 0.2),
            new THREE.Vector2(0.43, 0.48),
            new THREE.Vector2(0.34, 0.64),
          ],
          12,
        ),
        iron,
        [0, 0.22, 0],
        [1, 1, 0.68],
      );
      plate(
        body,
        [
          [-0.24, 0.48],
          [0.24, 0.48],
          [0.31, 0.25],
          [0.18, 0],
          [-0.18, 0],
          [-0.31, 0.25],
        ],
        0.06,
        [0, 0.32, 0.29],
        iron,
      );
      taper(body, 0.25, 0.33, 0.15, [0, 0.91, 0], brass, [1, 1, 0.75]);
      for (const side of [-1, 1])
        for (const y of [0.17, 0.3]) {
          const fauld = box(body, [0.27, 0.16, 0.12], [side * 0.25, y, 0.2], iron);
          fauld.rotation.z = side * 0.15;
        }
    } else {
      taper(body, 0.29, 0.49, 1.36, [0, -0.3, 0], cloth);
      taper(body, 0.24, 0.36, 0.6, [0, 0.62, 0], cloth, [1.25, 1, 0.8]);
      for (const side of [-1, 1])
        plate(
          body,
          [
            [0, 0.8],
            [side * 0.12, 0.65],
            [side * 0.19, -0.95],
            [0, -1],
          ],
          0.014,
          [side * 0.13, 0.1, 0.32],
          brass,
        );
    }
    taper(body, 0.31, 0.31, 0.08, [0, 0.21, 0], brass, [1.2, 1, 0.8]);
    const head = joint("head", body, [0, 1, 0]);
    if (sentinel) {
      oval(head, [0.21, 0.27, 0.21], [0, 0.12, 0], iron);
      plate(
        head,
        [
          [-0.18, 0.32],
          [0.18, 0.32],
          [0.19, 0.03],
          [0.09, -0.12],
          [-0.09, -0.12],
          [-0.19, 0.03],
        ],
        0.055,
        [0, 0.05, 0.19],
        iron,
      );
      box(head, [0.32, 0.026, 0.028], [0, 0.14, 0.227], dark);
      for (const side of [-1, 1]) box(head, [0.07, 0.012, 0.01], [side * 0.09, 0.14, 0.247], ember);
      box(head, [0.035, 0.38, 0.018], [0, 0.14, 0.25], brass);
      // Broken, swept-back crest reads as a helmet rather than a wizard hat.
      plate(
        head,
        [
          [-0.035, 0],
          [0.035, 0],
          [0.025, 0.21],
          [-0.02, 0.31],
        ],
        0.23,
        [0, 0.34, -0.1],
        brass,
      ).rotation.y = Math.PI / 2;
    } else {
      const hood = mesh(
        head,
        new THREE.CylinderGeometry(0.08, 0.34, 0.55, 9, 1, true),
        cloth,
        [0, 0.16, -0.035],
        [1, 1, 0.9],
      );
      hood.rotation.x = -0.12;
      oval(head, [0.16, 0.22, 0.13], [0, 0.04, 0.17], dark);
      plate(
        head,
        [
          [-0.13, 0.2],
          [0.13, 0.2],
          [0.1, -0.14],
          [0, -0.19],
          [-0.1, -0.14],
        ],
        0.03,
        [0, 0.02, 0.28],
        bone,
      );
      for (const side of [-1, 1])
        box(head, [0.057, 0.035, 0.012], [side * 0.065, 0.08, 0.304], dark);
      box(head, [0.018, 0.07, 0.01], [0, 0.1, 0.314], ember);
    }
    for (const side of [-1, 1]) {
      const suffix = side > 0 ? "R" : "L";
      const { upper, bend } = limb(
        `arm${suffix}`,
        body,
        [side * 0.4, 0.8, 0],
        0.36,
        0.105,
        sentinel ? iron : cloth,
        `forearm${suffix}`,
        0.35,
      );
      oval(upper, [0.19, 0.14, 0.2], [side * 0.02, 0.01, 0], sentinel ? iron : cloth);
      const hand = joint(`hand${suffix}`, bend, [0, -0.36, 0]);
      oval(hand, [0.075, 0.1, 0.075], [0, -0.02, 0], sentinel ? dark : bone);
      if (sentinel && side < 0) {
        plate(
          bend,
          [
            [-0.26, 0.25],
            [0.26, 0.25],
            [0.3, -0.18],
            [0, -0.65],
            [-0.3, -0.18],
          ],
          0.08,
          [-0.11, -0.12, 0.2],
          iron,
        );
        plate(
          bend,
          [
            [-0.025, 0.23],
            [0.025, 0.23],
            [0.025, -0.5],
            [0, -0.59],
            [-0.025, -0.5],
          ],
          0.015,
          [-0.11, -0.12, 0.247],
          brass,
        );
        oval(bend, [0.075, 0.075, 0.025], [-0.11, -0.25, 0.25], brass);
      } else if (sentinel) {
        taper(hand, 0.04, 0.04, 0.27, [0, 0, 0.03], dark).rotation.x = Math.PI / 2;
        box(hand, [0.35, 0.065, 0.07], [0, 0, 0.18], brass);
        const blade = plate(
          hand,
          [
            [-0.055, 0],
            [0.055, 0],
            [0.09, 0.88],
            [0, 1.23],
            [-0.09, 0.88],
          ],
          0.038,
          [0, 0, 0.23],
          iron,
        );
        blade.rotation.x = Math.PI / 2;
        box(hand, [0.018, 0.025, 0.96], [0, -0.025, 0.71], brass);
      } else if (side > 0) {
        const lantern = joint("lantern", hand, [0, -0.24, 0.03]);
        taper(lantern, 0.12, 0.13, 0.25, [0, 0, 0], ember);
        for (const y of [-0.18, 0.18]) taper(lantern, 0.18, 0.2, 0.075, [0, y, 0], brass);
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          box(lantern, [0.025, 0.35, 0.025], [Math.sin(a) * 0.16, 0, Math.cos(a) * 0.16], brass);
        }
        mesh(lantern, new THREE.TorusGeometry(0.1, 0.018, 4, 10), brass, [0, 0.27, 0]);
      }
    }
    for (const side of [-1, 1]) {
      const suffix = side > 0 ? "FR" : "FL";
      const { bend } = limb(
        `leg${suffix}`,
        body,
        [side * 0.19, -0.06, 0],
        0.44,
        0.115,
        sentinel ? iron : dark,
        `knee${suffix}`,
        0.43,
      );
      const foot = joint(`foot${suffix}`, bend, [0, -0.43, 0]);
      oval(foot, [0.13, 0.075, 0.22], [0, -0.025, 0.07], dark);
      if (sentinel) box(bend, [0.14, 0.31, 0.04], [0, -0.21, 0.09], iron);
    }
    const cape = joint("cape", body, [0, 0.83, -0.24]);
    const capeGeometry = new THREE.PlaneGeometry(0.68, 1.48, 3, 3);
    const positions = capeGeometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      positions.setXYZ(
        i,
        positions.getX(i) * (1.05 - y * 0.22),
        y - 0.68,
        -0.04 - Math.max(0, -y) * 0.12,
      );
      if (y < -0.7) positions.setY(i, positions.getY(i) + Math.abs(Math.sin(i * 2.7)) * 0.12);
    }
    capeGeometry.computeVertexNormals();
    mesh(cape, capeGeometry, cloth);
    oval(body, [0.055, 0.055, 0.03], [0, 0.83, 0.28], brass);
  }
  if (batch) batchJointMeshes(root);
  return {
    root,
    joints,
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>();
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) geometries.add(o.geometry);
      });
      geometries.forEach((g) => g.dispose());
      [iron, dark, bone, cloth, brass, ember, metalSurface, matteSurface].forEach((m) =>
        m.dispose(),
      );
    },
  };
}
