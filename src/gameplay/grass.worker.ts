import { grassMatrices } from "./grassMatrices";

self.onmessage = ({
  data,
}: MessageEvent<{ key: string; x: number; z: number; density: number }>) => {
  const matrices = grassMatrices(data.x, data.z, data.density);
  self.postMessage(
    { key: data.key, x: data.x, z: data.z, matrices },
    { transfer: [matrices.buffer] },
  );
};
