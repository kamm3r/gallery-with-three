import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGame } from "../hooks/useGame";
import { vec3 } from "math";
import {
  FREE_CAMERA_KEYS,
  FREE_CAMERA_SPEED,
  cameraViewFromSearch,
  freeCameraMovement,
} from "../gameplay/freeCamera";
import { occlusionUniforms } from "../gameplay/occlusionDither";

const readout = { position: [0, 0, 0], speed: FREE_CAMERA_SPEED };
const movement = vec3.create();
const step = new THREE.Vector3();
const textInput = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));

/** Owns the view while the render loop holds game time fixed. */
export function FreeCamera() {
  const { freeCamera, paused, settings } = useGame();
  const { camera, gl } = useThree();
  const flight = useRef({
    position: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    speed: FREE_CAMERA_SPEED,
    keys: new Set<string>(),
    previous: 0,
  });
  useLayoutEffect(() => {
    if (!freeCamera) return;
    const savedPosition = camera.position.clone(),
      savedRotation = camera.quaternion.clone();
    const rotation = new THREE.Euler().setFromQuaternion(savedRotation, "YXZ");
    const state = flight.current;
    state.position.copy(savedPosition);
    state.yaw = rotation.y;
    state.pitch = rotation.x;
    // Dev inspection: ?camera=x,y,z&look=x,y,z opens the free camera on that view.
    const view = import.meta.env.DEV ? cameraViewFromSearch(location.search) : null;
    if (view) {
      state.position.fromArray(view.position);
      state.yaw = view.yaw;
      state.pitch = view.pitch;
    }
    state.previous = performance.now();
    state.keys.clear();
    readout.position = state.position.toArray();
    readout.speed = state.speed;
    occlusionUniforms.uOcclusionEnabled.value = 0;
    return () => {
      state.keys.clear();
      camera.position.copy(savedPosition);
      camera.quaternion.copy(savedRotation);
      camera.updateMatrixWorld();
    };
  }, [freeCamera, camera]);

  useEffect(() => {
    const state = flight.current;
    state.keys.clear();
    state.previous = performance.now();
    if (!freeCamera || paused) return;
    const canvas = gl.domElement;
    let dragging = false;
    const keyDown = (event: KeyboardEvent) => {
      if (textInput(event.target) || !FREE_CAMERA_KEYS.has(event.code)) return;
      event.preventDefault();
      state.keys.add(event.code);
    };
    const keyUp = (event: KeyboardEvent) => state.keys.delete(event.code);
    const clear = () => {
      state.keys.clear();
      dragging = false;
    };
    const look = (dx: number, dy: number) => {
      const sensitivity = (0.003 * settings.sensitivity) / 100;
      state.yaw -= dx * sensitivity;
      state.pitch = THREE.MathUtils.clamp(
        state.pitch - dy * sensitivity * (settings.invertY ? -1 : 1),
        -Math.PI / 2 + 0.01,
        Math.PI / 2 - 0.01,
      );
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary) return;
      dragging = true;
      if (!document.pointerLockElement) canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (dragging && !document.pointerLockElement) look(event.movementX, event.movementY);
    };
    const up = (event: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    const mouse = (event: MouseEvent) => {
      if (document.pointerLockElement) look(event.movementX, event.movementY);
    };
    const lock = () => {
      if (document.pointerLockElement) return;
      try {
        const request = canvas.requestPointerLock() as Promise<void> | undefined;
        request?.catch(() => {});
      } catch {
        /* Drag-to-look works when capture is unavailable. */
      }
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      state.speed = THREE.MathUtils.clamp(state.speed * Math.exp(-event.deltaY * 0.002), 1, 160);
      readout.speed = state.speed;
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", clear);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("click", lock);
    canvas.addEventListener("wheel", wheel, { passive: false });
    document.addEventListener("mousemove", mouse);
    return () => {
      clear();
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", clear);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("click", lock);
      canvas.removeEventListener("wheel", wheel);
      document.removeEventListener("mousemove", mouse);
    };
  }, [freeCamera, paused, gl, settings.sensitivity, settings.invertY]);

  // After chase cameras, before visibility and postprocessing. Wall time drives only
  // this camera; game time and physics remain frozen in PauseRenderLoop.
  useFrame(() => {
    if (!freeCamera || paused) return;
    const state = flight.current,
      now = performance.now();
    state.position.add(
      step.fromArray(
        freeCameraMovement(
          state.keys,
          state.yaw,
          state.pitch,
          state.speed,
          (now - state.previous) / 1000,
          movement,
        ),
      ),
    );
    state.previous = now;
    camera.position.copy(state.position);
    camera.quaternion.setFromEuler(new THREE.Euler(state.pitch, state.yaw, 0, "YXZ"));
    camera.updateMatrixWorld();
    occlusionUniforms.uOcclusionEnabled.value = 0;
    readout.position = state.position.toArray();
  }, 0.25);
  return null;
}

export function FreeCameraTools({ unavailable }: { unavailable: boolean }) {
  const { freeCamera, setFreeCamera, paused } = useGame();
  const [info, setInfo] = useState({ ...readout });
  const [copied, setCopied] = useState(false);
  const setter = useRef(setFreeCamera);
  setter.current = setFreeCamera;
  useEffect(() => () => setter.current(false), []);
  // Dev inspection links open straight into the free camera once the scene is ready.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || unavailable || !import.meta.env.DEV) return;
    if (!cameraViewFromSearch(location.search)) return;
    const timer = window.setTimeout(() => {
      opened.current = true;
      setFreeCamera(true);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [unavailable, setFreeCamera]);
  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      if (event.code !== "F8" || event.repeat || textInput(event.target) || paused || unavailable)
        return;
      event.preventDefault();
      event.stopPropagation();
      setFreeCamera(!freeCamera);
    };
    window.addEventListener("keydown", toggle, true);
    return () => window.removeEventListener("keydown", toggle, true);
  }, [freeCamera, setFreeCamera, paused, unavailable]);
  useEffect(() => {
    if (!freeCamera) return;
    const timer = window.setInterval(
      () => setInfo({ position: [...readout.position], speed: readout.speed }),
      100,
    );
    return () => window.clearInterval(timer);
  }, [freeCamera]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${location.pathname} · camera [${readout.position.map((n) => n.toFixed(2)).join(", ")}]`,
      );
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <aside className="free-camera-tools" hidden={paused} aria-label="Camera inspection">
      <button
        type="button"
        disabled={unavailable}
        aria-pressed={freeCamera}
        onClick={() => {
          setCopied(false);
          setFreeCamera(!freeCamera);
        }}
      >
        {freeCamera ? "Return to player" : "Free camera"} <kbd>F8</kbd>
      </button>
      {freeCamera && (
        <div className="free-camera-details">
          <strong>Free camera · gameplay frozen</strong>
          <span>WASD fly · Q/E down/up · Shift fast · Ctrl slow</span>
          <span>Click or drag to look · Scroll adjusts speed</span>
          <output>
            XYZ {info.position.map((n) => n.toFixed(2)).join(" / ")} · {info.speed.toFixed(0)} m/s
          </output>
          <button
            type="button"
            onClick={() => {
              void copy();
            }}
          >
            {copied ? "Coordinates copied" : "Copy coordinates"}
          </button>
        </div>
      )}
    </aside>
  );
}
