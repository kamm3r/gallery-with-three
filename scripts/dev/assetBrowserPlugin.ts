import { readdir, realpath, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import type { Plugin } from "vite-plus";

export type AssetEntry = {
  name: string;
  path: string;
  url: string;
  kind: "folder" | "model" | "image" | "audio" | "file";
  size: number;
  modified: number;
};
export async function listAssetDirectory(root: string, folder: string): Promise<AssetEntry[]> {
  if (
    folder.includes("\\") ||
    folder.includes("\0") ||
    folder.split("/").some((part) => part === ".." || part === ".")
  )
    throw new Error("Invalid asset folder");
  const base = await realpath(root);
  const directory = await realpath(resolve(base, folder));
  if (directory !== base && !directory.startsWith(`${base}${sep}`))
    throw new Error("Asset folder is outside Assets");
  const entries = await readdir(directory, { withFileTypes: true });
  const result: AssetEntry[] = [];
  for (const entry of entries) {
    if (
      entry.name.startsWith(".") ||
      entry.isSymbolicLink() ||
      (!entry.isDirectory() && !entry.isFile())
    )
      continue;
    const path = folder ? `${folder}/${entry.name}` : entry.name;
    const info = await stat(resolve(directory, entry.name));
    const extension = extname(entry.name).toLowerCase();
    const kind = entry.isDirectory()
      ? "folder"
      : [".glb", ".gltf"].includes(extension)
        ? "model"
        : [".png", ".jpg", ".jpeg", ".webp", ".avif", ".svg"].includes(extension)
          ? "image"
          : [".wav", ".ogg", ".mp3", ".m4a"].includes(extension)
            ? "audio"
            : "file";
    result.push({
      name: entry.name,
      path,
      url: `/assets/${path.split("/").map(encodeURIComponent).join("/")}`,
      kind,
      size: info.size,
      modified: info.mtimeMs,
    });
  }
  return result.sort(
    (a, b) =>
      Number(b.kind === "folder") - Number(a.kind === "folder") || a.name.localeCompare(b.name),
  );
}
export function assetBrowserPlugin(): Plugin {
  return {
    name: "playground-asset-browser",
    apply: "serve",
    configureServer(server) {
      const root = resolve(server.config.root, "public/assets");
      server.middlewares.use("/__editor/assets", (request, response) => {
        void (async () => {
          response.setHeader("Content-Type", "application/json");
          response.setHeader("Cache-Control", "no-store");
          if (request.method !== "GET") {
            response.statusCode = 405;
            response.end(JSON.stringify({ error: "Read-only asset browser" }));
            return;
          }
          try {
            const url = new URL(request.url ?? "/", "http://localhost");
            const folder = url.searchParams.get("folder") ?? "";
            response.end(
              JSON.stringify({ folder, entries: await listAssetDirectory(root, folder) }),
            );
          } catch (error) {
            response.statusCode = 400;
            response.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : "Cannot read Assets",
              }),
            );
          }
        })();
      });
    },
  };
}
