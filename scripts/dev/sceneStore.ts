import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  serializeSceneDocument,
  validateSceneDocument,
  type SceneDocument,
} from "../../src/gameplay/sceneDocument.ts";

export async function readSceneFile(path: string) {
  const content = await readFile(path, "utf8");
  return {
    document: validateSceneDocument(JSON.parse(content)),
    revision: createHash("sha256").update(content).digest("hex"),
  };
}

export async function saveSceneFile(path: string, value: unknown, expectedRevision: string) {
  const document = validateSceneDocument(value);
  const current = await readSceneFile(path);
  if (current.revision !== expectedRevision)
    throw new Error(
      "Scene changed on disk. Reload before saving to avoid overwriting another edit.",
    );
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, serializeSceneDocument(document), "utf8");
  await rename(temporary, path);
  return readSceneFile(path);
}

export type SceneSave = { document: SceneDocument; revision: string };
