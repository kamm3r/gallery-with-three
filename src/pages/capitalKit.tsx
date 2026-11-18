import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "../hooks/useRoute";
import * as THREE from "three";
import {
  capitalKitCatalogue,
  capitalKitGeometry,
  capitalKitLeaves,
  capitalKitTexture,
  capitalKitUv,
} from "../gameplay/capitalBuildingKit";

/** The reference's blue-walled showroom: 44 × 27 m of grey checker floor. */
const ROOM = { w: 44, d: 27, h: 3.5, t: 1, x: -0.4, z: -2.6 };

/** Hinged leaves that swing out towards +Z; click a door to open or close it. */
function DoorLeaves({
  piece,
  material,
  open,
}: {
  piece: (typeof capitalKitCatalogue)[number];
  material: THREE.Material;
  open: boolean;
}) {
  const leaves = useMemo(
    () =>
      capitalKitLeaves(piece.model, piece.size, piece.thickness).map((leaf) => ({
        ...leaf,
        geometry: capitalKitUv(leaf.geometry),
      })),
    [piece],
  );
  useEffect(() => () => leaves.forEach((l) => l.geometry.dispose()), [leaves]);
  const [toggled, setToggled] = useState(false);
  const target = open !== toggled ? 1 : 0;
  const amount = useRef(0);
  const hinges = useRef<Array<THREE.Group | null>>([]);
  useFrame((_, dt) => {
    amount.current += THREE.MathUtils.clamp(target - amount.current, -dt * 1.5, dt * 1.5);
    const eased = THREE.MathUtils.smoothstep(amount.current, 0, 1);
    leaves.forEach((leaf, i) => hinges.current[i]?.rotation.set(0, leaf.openAngle * eased, 0));
  });
  return (
    <group position={piece.position} rotation={piece.rotation ?? [0, 0, 0]}>
      {leaves.map((leaf, i) => (
        <group key={i} position={leaf.hinge} ref={(g) => void (hinges.current[i] = g)}>
          <mesh
            geometry={leaf.geometry}
            material={material}
            castShadow
            receiveShadow
            onClick={(e) => {
              e.stopPropagation();
              setToggled((t) => !t);
            }}
          />
        </group>
      ))}
    </group>
  );
}

function KitModels({ labels, doorsOpen }: { labels: boolean; doorsOpen: boolean }) {
  const resources = useMemo(() => {
    const textures = {
      orange: capitalKitTexture("orange"),
      blue: capitalKitTexture("blue"),
      floor: capitalKitTexture("floor"),
    };
    const materials = {
      orange: new THREE.MeshStandardMaterial({ map: textures.orange, roughness: 0.85 }),
      blue: new THREE.MeshStandardMaterial({ map: textures.blue, roughness: 0.9 }),
      floor: new THREE.MeshStandardMaterial({ map: textures.floor, roughness: 0.95 }),
    };
    const pieces = capitalKitCatalogue.map((piece) => {
      const transform = new THREE.Matrix4().compose(
        new THREE.Vector3(...piece.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(piece.rotation ?? [0, 0, 0]))),
        new THREE.Vector3(1, 1, 1),
      );
      return {
        ...piece,
        geometry: capitalKitUv(
          capitalKitGeometry(piece.model, piece.size, piece.thickness),
          transform,
        ).applyMatrix4(transform),
      };
    });
    const shell = [
      capitalKitUv(
        new THREE.BoxGeometry(ROOM.w + 2 * ROOM.t, 0.2, ROOM.d + 2 * ROOM.t).translate(
          ROOM.x,
          -0.1,
          ROOM.z,
        ),
      ),
    ];
    const walls = [
      [0, -(ROOM.d + ROOM.t) / 2, ROOM.w + 2 * ROOM.t, ROOM.t],
      [0, (ROOM.d + ROOM.t) / 2, ROOM.w + 2 * ROOM.t, ROOM.t],
      [-(ROOM.w + ROOM.t) / 2, 0, ROOM.t, ROOM.d],
      [(ROOM.w + ROOM.t) / 2, 0, ROOM.t, ROOM.d],
    ].map(([x, z, w, d]) =>
      capitalKitUv(
        new THREE.BoxGeometry(w, ROOM.h, d).translate(ROOM.x + x, ROOM.h / 2, ROOM.z + z),
      ),
    );
    return { textures, materials, pieces, floor: shell[0], walls };
  }, []);
  useEffect(
    () => () => {
      Object.values(resources.textures).forEach((t) => t.dispose());
      Object.values(resources.materials).forEach((m) => m.dispose());
      resources.pieces.forEach((p) => p.geometry.dispose());
      [resources.floor, ...resources.walls].forEach((g) => g.dispose());
    },
    [resources],
  );
  return (
    <>
      <mesh geometry={resources.floor} material={resources.materials.floor} receiveShadow />
      {resources.walls.map((g, i) => (
        <mesh key={i} geometry={g} material={resources.materials.blue} castShadow receiveShadow />
      ))}
      {resources.pieces.map((piece) => (
        <group key={piece.name}>
          <mesh
            geometry={piece.geometry}
            material={resources.materials.orange}
            castShadow
            receiveShadow
          />
          {piece.model.endsWith("door") && (
            <DoorLeaves piece={piece} material={resources.materials.blue} open={doorsOpen} />
          )}
          {labels && (
            <Html
              position={[piece.position[0], 0.05, piece.position[2] + piece.size[2] / 2 + 0.6]}
              center
            >
              <span
                style={{
                  whiteSpace: "nowrap",
                  fontSize: 10,
                  color: "#273d4b",
                  pointerEvents: "none",
                }}
              >
                {piece.name}
              </span>
            </Html>
          )}
        </group>
      ))}
    </>
  );
}
export default function CapitalKit() {
  const [labels, setLabels] = useState(false);
  const [doorsOpen, setDoorsOpen] = useState(false);
  return (
    <main style={{ width: "100vw", height: "100vh", background: "#dfe3e6" }}>
      <Canvas shadows camera={{ position: [-2.4, 36, 17], fov: 42 }}>
        <color attach="background" args={["#dfe3e6"]} />
        <hemisphereLight args={["#ffffff", "#8e9aa6", 1]} />
        <directionalLight
          position={[-18, 30, -14]}
          intensity={2.8}
          castShadow
          shadow-mapSize={[4096, 4096]}
          shadow-camera-left={-26}
          shadow-camera-right={26}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
          shadow-bias={-0.0004}
        />
        <KitModels labels={labels} doorsOpen={doorsOpen} />
        <OrbitControls target={[-2.4, 0, -3.6]} minDistance={8} maxDistance={90} />
      </Canvas>
      <div
        style={{
          position: "absolute",
          bottom: 24,
          left: 24,
          padding: "12px 16px",
          background: "#edf1f0ee",
          color: "#273d4b",
          border: "1px solid #abbac2",
          fontFamily: "sans-serif",
          fontSize: 13,
        }}
      >
        <p style={{ margin: "0 0 6px", fontSize: 16 }}>Capital construction kit</p>
        <p style={{ margin: "0 0 8px" }}>
          {capitalKitCatalogue.length} pieces · 1 m checker · drag to orbit
        </p>
        <label style={{ display: "block", marginBottom: 8 }}>
          <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />{" "}
          Show names
        </label>
        <label style={{ display: "block", marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={doorsOpen}
            onChange={(e) => setDoorsOpen(e.target.checked)}
          />{" "}
          Open doors (or click one)
        </label>
        <Link to="/boss" style={{ color: "#273d4b" }}>
          Explore the capital →
        </Link>
      </div>
    </main>
  );
}
