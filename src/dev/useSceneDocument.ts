import { pasteSceneNode, type NodeClipboard } from "./nodeClipboard";
import { useCallback, useEffect, useRef, useState } from "react";
import initialScene from "../gameplay/playgroundScene.json";
import {
  setSceneTransform,
  setSceneProperties,
  resetSceneProperties,
  resetSceneProperty,
  type SceneProperties,
  createSceneNode,
  duplicateSceneNode,
  deleteSceneNode,
  type SceneNode,
  validateSceneDocument,
  type SceneDocument,
  type SceneTransform,
} from "../gameplay/sceneDocument";

export function useSceneDocument() {
  const [document, setDocument] = useState<SceneDocument>(() =>
    validateSceneDocument(initialScene),
  );
  const documentRef = useRef(document);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Loading scene…");
  const saved = useRef(JSON.stringify(document));
  const revision = useRef("");
  const undoStack = useRef<SceneDocument[]>([]),
    redoStack = useRef<SceneDocument[]>([]);
  const [, refresh] = useState(0);
  const assign = useCallback((next: SceneDocument) => {
    documentRef.current = next;
    setDocument(next);
  }, []);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/__editor/playground-scene");
      if (!response.ok) throw new Error("Could not load the scene resource");
      const payload = await response.json();
      const next = validateSceneDocument(payload.document);
      assign(next);
      saved.current = JSON.stringify(next);
      revision.current = payload.revision;
      undoStack.current = [];
      redoStack.current = [];
      setReady(true);
      setMessage("Scene saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Load failed");
    }
  }, [assign]);
  useEffect(() => {
    void load();
  }, [load]);
  const change = useCallback(
    (action: (current: SceneDocument) => SceneDocument) => {
      if (!revision.current) return false;
      try {
        const next = action(documentRef.current);
        if (JSON.stringify(next) === JSON.stringify(documentRef.current)) return false;
        undoStack.current.push(documentRef.current);
        redoStack.current = [];
        if (undoStack.current.length > 100) undoStack.current.shift();
        assign(next);
        setMessage("Unsaved changes");
        return true;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Invalid edit");
        return false;
      }
    },
    [assign],
  );
  const commit = useCallback(
    (id: string, transform: SceneTransform) => {
      change((current) => setSceneTransform(current, id, transform));
    },
    [change],
  );
  const create = useCallback(
    (template: string, transform: SceneTransform) => {
      const id = `node-${crypto.randomUUID()}`;
      return change((current) =>
        createSceneNode(
          current,
          id,
          { name: template.replace("primitive-", ""), template, color: "#a8b5c9", dynamic: false },
          transform,
        ),
      )
        ? id
        : null;
    },
    [change],
  );
  const createAsset = useCallback(
    (assetUrl: string, name: string, transform: SceneTransform) => {
      const id = `node-${crypto.randomUUID()}`;
      return change((current) =>
        createSceneNode(
          current,
          id,
          { name: name.slice(0, 120), template: "asset-model", assetUrl },
          transform,
        ),
      )
        ? id
        : null;
    },
    [change],
  );
  const duplicate = useCallback(
    (sourceId: string, name: string, transform: SceneTransform) => {
      const id = `node-${crypto.randomUUID()}`;
      return change((current) =>
        duplicateSceneNode(current, sourceId, id, `${name} copy`, transform),
      )
        ? id
        : null;
    },
    [change],
  );
  const paste = useCallback(
    (snapshot: NodeClipboard) => {
      const id = `node-${crypto.randomUUID()}`;
      return change((current) => pasteSceneNode(current, snapshot, id)) ? id : null;
    },
    [change],
  );
  const remove = useCallback(
    (id: string) => change((current) => deleteSceneNode(current, id)),
    [change],
  );
  const updateNode = useCallback(
    (id: string, patch: Partial<SceneNode>) =>
      change((current) => {
        if (!current.nodes[id]) throw new Error("Only scene-owned node properties can be changed");
        return validateSceneDocument({
          ...current,
          nodes: { ...current.nodes, [id]: { ...current.nodes[id], ...patch } },
        });
      }),
    [change],
  );
  const updateProperties = useCallback(
    (id: string, patch: SceneProperties) =>
      change((current) => setSceneProperties(current, id, patch)),
    [change],
  );
  const resetProperties = useCallback(
    (id: string) => change((current) => resetSceneProperties(current, id)),
    [change],
  );
  const resetProperty = useCallback(
    (id: string, key: keyof SceneProperties) =>
      change((current) => resetSceneProperty(current, id, key)),
    [change],
  );
  const undo = useCallback(() => {
    const next = undoStack.current.pop();
    if (!next) return;
    redoStack.current.push(documentRef.current);
    assign(next);
    setMessage(JSON.stringify(next) === saved.current ? "Scene saved" : "Unsaved changes");
    refresh((n) => n + 1);
  }, [assign]);
  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(documentRef.current);
    assign(next);
    setMessage(JSON.stringify(next) === saved.current ? "Scene saved" : "Unsaved changes");
    refresh((n) => n + 1);
  }, [assign]);
  const save = useCallback(async () => {
    if (!revision.current) return false;
    const snapshot = documentRef.current;
    setSaving(true);
    try {
      const response = await fetch("/__editor/playground-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: snapshot, revision: revision.current }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Save failed");
      revision.current = payload.revision;
      saved.current = JSON.stringify(snapshot);
      setMessage("Scene saved to project");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  }, []);
  const dirty = JSON.stringify(document) !== saved.current;
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(documentRef.current) !== saved.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  return {
    document,
    transact: change,
    ready,
    dirty,
    saving,
    message,
    commit,
    create,
    createAsset,
    duplicate,
    paste,
    remove,
    updateNode,
    updateProperties,
    resetProperties,
    resetProperty,
    undo,
    redo,
    save,
    reload: load,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
  };
}
