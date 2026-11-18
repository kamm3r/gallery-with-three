export type AssetEntry = {
  name: string;
  path: string;
  url: string;
  kind: "folder" | "model" | "image" | "audio" | "file";
  size: number;
  modified: number;
};
export function assetSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : bytes >= 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${bytes} B`;
}
