import type { Plugin } from "vite-plus";
import { resolve } from "node:path";
import { readSceneFile, saveSceneFile } from "./sceneStore.ts";

export function sceneEditorPlugin(): Plugin {
  return {
    name: "playground-scene-resource",
    apply: "serve",
    handleHotUpdate(context) {
      if (context.file === resolve(context.server.config.root, "src/gameplay/playgroundScene.json"))
        return [];
    },
    configureServer(server) {
      const file = resolve(server.config.root, "src/gameplay/playgroundScene.json");
      // Serialize saves, including requests from multiple tabs.
      let queue = Promise.resolve();
      server.middlewares.use("/__editor/playground-scene", (request, response) => {
        response.setHeader("Content-Type", "application/json");
        response.setHeader("Cache-Control", "no-store");
        const run = async () => {
          try {
            if (request.method === "GET") {
              response.end(JSON.stringify(await readSceneFile(file)));
              return;
            }
            if (request.method !== "POST") {
              response.statusCode = 405;
              response.end(JSON.stringify({ error: "Method not allowed" }));
              return;
            }
            if (
              request.headers.origin &&
              request.headers.origin !== `http://${request.headers.host}` &&
              request.headers.origin !== `https://${request.headers.host}`
            ) {
              response.statusCode = 403;
              response.end(JSON.stringify({ error: "Cross-origin saves are not allowed" }));
              return;
            }
            let body = "";
            for await (const chunk of request) {
              body += chunk.toString();
              if (Buffer.byteLength(body) > 1024 * 1024) throw new Error("Scene exceeds 1 MB");
            }
            const payload = JSON.parse(body);
            const saved = await saveSceneFile(file, payload.document, payload.revision);
            response.end(JSON.stringify(saved));
          } catch (error) {
            response.statusCode = 400;
            response.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : "Unable to save scene",
              }),
            );
          }
        };
        queue = queue.then(run, run);
      });
    },
  };
}
