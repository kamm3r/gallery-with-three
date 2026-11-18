# Proving grounds editor

Run `vp run dev` and open `/playground?inspector`, or choose **Scene tools → Open browser inspector** in the test world's Tuning panel.

## Editor workspace

The editor uses compact, flat gray docks, a blue hierarchy selection, one small viewport toolbar, and centered Play/Pause/Step controls. The navigation hint overlay is omitted. Panels remain visible during Game preview; scene edits are read-only until Stop.

The Hierarchy traverses authored nodes and flattens implementation wrappers. Groups start collapsed; selecting a child in the viewport reveals its ancestors. Each row has visibility/lock actions and a right-click menu. The Inspector shows Transform first, followed by the selected node's own renderer, light, physics, or camera settings. Nested authored children and decorative floor labels are not presented as components of their parent group. Property search opens from the header icon. The header padlock pins the inspected node independently of hierarchy selection; this is separate from the saved per-node selection lock.

Double-click a mesh or material in Resources to open its own resource pane while the Scene and main Inspector remain available. The resource pane keeps its own inspected resource as scene selection changes. It shows a color preview; for created primitives, material color edits are saved. Shared prefab materials remain read-only.

The hierarchy supports **Up/Down**, **Home/End**, **Left/Right** to navigate and collapse/expand branches, and **Enter/Space** to select. Selecting an object in the viewport reveals its row, expands its ancestors, and scrolls it into view. The tree preserves authored parent/child relationships while flattening render and physics wrappers. Locked and hidden objects remain selectable from the hierarchy; viewport picking skips them and editor helpers. Clicking empty scene space clears selection.

The Project drawer collapses from its header and has Project and Scene Resources tabs. Scene and Resource workspace presets have independent remembered sizes and drawer states; **Save layout** remembers the current layout in browser storage.

## Scene root and node actions

`World3D` is a real authored group shared by the editor and the game. Its objects are children of that group. Select the root to rename it or edit its position, rotation, and scale; root transforms are saved and undoable, and committed transforms rebuild descendant physics. The root cannot be cut, copied, duplicated, or deleted. Existing scenes without a root override use the identity transform.

Right-click a hierarchy row, press **Shift+F10**, or use the header's **⋮** button for node actions. The menu provides primitive creation, frame selection, expand/collapse branch, cut/copy/paste, duplicate, rename, visibility, lock, copy node path, and delete. **F2** starts inline rename; Enter commits and Escape cancels. Menus support arrow-key navigation and Escape to dismiss.

**Ctrl+C/X/V** copies, cuts, or pastes individual objects. The editor clipboard stores the source template, transform, primitive settings, and property overrides, so pasting still works after the source instance is deleted. Paste creates a new persistent ID, selects it, and is one undo action. The clipboard is local to the current editor session. Whole-branch copy/duplicate is disabled; authored groups support transforms, rename, branch controls, and deletion. Adding primitives creates children of World3D, including when its transform is non-default.

Script attachment, arbitrary reparenting, scene-file instancing, and saving branches as reusable scenes are not implemented by this menu.

## Create, duplicate, and delete

Open the **+** menu in the viewport bar and choose Box, Sphere, Cylinder, or Cone to place an object in front of the scene camera. New objects are selected for editing. Their Inspector supports name, material color, and fixed/dynamic body type, in addition to transforms.

**Duplicate / Ctrl+D** instances the selected authored node with an offset. Duplicating another duplicate retains the original prefab reference. **Delete** removes a selected node; for source prefabs it writes a deletion record rather than modifying source code. Prefab copies continue to exist if the source instance is deleted. Undo/redo covers creation, duplication, deletion, property edits, and placement.

The saved scene now defines created objects, removed source instances, and per-node property overrides, not only transform overrides. Created nodes use persistent UUIDs; the runtime renders the same records with their physics bodies.

## Edit, save, and play

Select a scene object by clicking its mesh, choosing its node in the Scene dock, or selecting its resource. Selection resolves to the authored owner, so moving a tree moves its visuals and collision together, and moving an obstacle affects that obstacle rather than a batch.

- **W / Move**, **E / Rotate**, **R / Scale** show transform handles. **Q / Hand** hides them.
- **Snap** snaps gizmo drags to the increment for the active tool; the adjacent field, shown while snapping is active, sets that increment (metres, degrees, or scale factor). Hold **Ctrl** while dragging to snap temporarily without changing the toggle.
- **Center / Pivot** places the handles at the visual selection center or at the authored node origin. Center is the default; changing this preference does not move the object. Rotation and scaling in Center mode use the visual center. This keeps handles on offset groups and meshes without changing saved origins.
- **World / Local** switches the gizmo axes between world space and the selected node's own space.
- **Transform** in the Inspector edits position, rotation in degrees, and scale numerically. Press Enter or leave a field to commit it.
- **Ctrl+Z** undoes a committed edit; **Ctrl+Shift+Z** or **Ctrl+Y** redoes it. One gizmo drag is one action.
- **Save / Ctrl+S** writes `src/gameplay/playgroundScene.json` in the project. The title's asterisk marks unsaved changes. Failed saves leave the scene dirty and display the error.
- **Play** previews the current scene, including unsaved edits, resumes physics, mounts the third-person player at the park spawn, and unmutes game audio. The editor docks remain visible. **Pause** freezes simulation and character animation and mutes preview audio; **Step** advances one 1/60-second simulation frame while remaining paused. **Resume** continues playback. **Stop** (or **Escape**) restores the authored transforms and reselects the object you had selected.
- **Game** starts the in-place preview; **Scene** returns to editing. Open `/playground` separately for a standalone game run.
- **Escape** during editing cancels an active drag and clears selection. The normal pause menu is unmounted in editor mode. Leva is hidden and game audio is muted, without changing your saved volume setting.

Snap and transform-space choices are editor preferences stored in browser storage; they never mark the scene dirty. They are separate from the level resource, so another machine or browser starts from the defaults.

## Inspector properties

The Inspector edits persisted overrides for the selected authored node:

- **Name** in the object header, plus its eye button. Selection locking lives in the Hierarchy. Locked nodes cannot be picked in the viewport or receive a gizmo; their node selection still works. The Scene Tree exposes the same eye/lock actions per row.
- **Mesh Renderer**: mesh preview, material color, roughness, metalness, cast shadows, and receive shadows. Primitive color is stored on the created node; prefab material overrides are stored per node.
- **Light**: type, color, intensity, and cast shadows for the authored sun.
- **Rigidbody**: fixed, dynamic, or kinematic bodies; mass, gravity scale, damping, axis constraints, and continuous collision detection. **Collider**: automatic mesh geometry, box, sphere, or capsule, with center/rotation, dimensions, friction, bounciness, and trigger mode. Components can be disabled or removed. Source prefabs expose their existing bodies; compound source geometry stays authored.
- **Transform**: Local/World position, rotation, and scale, with **Reset** restoring the local transform. Local values are relative to the parent object, as in Unity. Every zone, structure, and prop group has its own ground origin (a zone sits at its floor label, a structure at its first piece), and its children are stored relative to it, so a group's Transform shows where it is and moving, rotating, or scaling it carries the whole branch. The viewport Center mode places the handle at the visual center without changing the origin.
- Each overridden property has a revert arrow that restores only that value; **Revert overrides** removes every saved property override so the node falls back to its authored defaults. All actions are undoable.

Property edits apply to the rendered scene and its physics immediately, and are written to the same scene resource on Save.

Authored nodes currently include individual course obstacles, moving platforms, pushables, one-way boards, jump pads, terrain, the bridge assembly, seesaw, zone strips, procedural tree specimens, and the sun light. Generated internals belong to their authored owner. Selecting remaining built-in environment content shows a read-only note instead of editable components, so it cannot receive an unsavable placement edit.

Transforms are absolute local transforms of stable authored node IDs. React applies the same node transform above both render and physics descendants. Committing an edit rebuilds that node's physics subtree at the new position, rotation, and scale. The collider overlay shows the resulting physics. Animated platforms use the saved origin, orientation, and scale for their motion path. Non-uniformly scaled round obstacles use convex colliders matching the scaled visual geometry.

The layout takes cues from GD Studio resource spaces and Godot Node3D properties. The Scene Tree and Inspector are custom editor components with no inspector-library dependency. The editor supports authored prefab instances, new primitives, and local GLB/glTF model nodes. Created primitives and models support Add Component, component Copy/Paste, Reset, Revert, and Remove. Motion scripts currently include project-owned Spin and Bob behaviors with saved fields; attaching motion to a physics object makes it kinematic during playback. Arbitrary script-file attachment, arbitrary reparenting, and converting other model formats remain outside its current scope.

## Project assets and model placement

The Project tab reads the real `public/assets` directory through a development-only read endpoint. Folder navigation, breadcrumbs, current-folder search, refresh, and a thumbnail-size slider work on actual files. Images display directly; local GLB/glTF models render into a shared thumbnail renderer. Scene Resources provides mesh/material thumbnails. Asset selection shows file details and image/model/audio previews in the Inspector.

Select a GLB/glTF file and choose **Add to Scene**, or drag it into the viewport. Drops are placed on the hit surface, falling back to the ground plane or a point ahead of the editor camera. Models get their own fixed trimesh collision, a persistent node ID, and a saved local asset URL. Moving, scaling, duplicating, cutting/pasting, deleting, and undo use the same scene document as primitives. Imported models start as static scene props. An Animation component plays embedded clips with clip selection, speed, loop, and autoplay settings, following the editor Play/Pause/Step clock. Other model formats are not imported. Failed models are isolated behind an error placeholder rather than taking down the world.

The asset endpoint is read-only, remains within the public asset root, and skips hidden entries and symlinks. Model references cannot contain remote URLs or traversal paths. No asset listing endpoint ships in production; saved local models still load from their public URLs.

## Materials, template overrides, and multiple selection

Mesh Renderer exposes local texture pickers for albedo, normal, roughness, metallic, and emission maps, plus opacity, emission, double-sided rendering, normal strength, UV tiling, and UV offset. Advanced material controls stay in a collapsed foldout. **Save as material** creates a reusable scene material; selecting a material shares it with other instances, while **Make unique** gives the object its own copy. Source GLTF materials and textures are cloned rather than mutated.

**Prefab overrides → Apply to template** makes component and appearance overrides defaults for instances of that primitive, built-in prefab, or model asset. Name, visibility, lock, and transform stay instance-specific. Component **Revert override** restores the template's component. **Revert overrides** clears instance property overrides. This is template-default inheritance, not a full prefab asset/nested-variant system.

Ctrl/Cmd-click toggles objects in the Hierarchy or viewport; Shift-click selects a Hierarchy range. Multiple selection shows common transform, appearance, and physics controls, with a dash for mixed numeric values. Gizmos transform selected roots together and skip selected descendants so a parent and child do not move twice. Batch edits and gizmo commits each create one Undo entry.

## Camera and viewport

The scene uses one 26px icon toolbar. The left group contains Create, Duplicate/Delete, transform space, Center/Pivot, and snapping. The right group contains projection, a Shading menu, light/camera icons, grid, colliders, camera preview, and a Viewport Options menu. Tooltips name each icon. Frame Selection and Reset View live in Viewport Options. A four-button tool strip inside the view selects Hand, Move, Rotate, and Scale.

The orientation widget follows the scene camera. Click one of its six axis heads for an axis view, drag its background to orbit, or use its Persp/Ortho button to switch projection. The toolbar projection icon performs the same switch. Framing and zoom work in both modes. Play uses perspective and Stop restores the editor projection and pose.

Camera and light icons select their authored nodes; selecting one also displays its frustum or direction helper. **Gizmos** controls those icons/helpers. **Main Camera** is an authored perspective camera with saved position/rotation and Inspector controls for field of view and clipping planes. The live bottom-right preview uses the selected camera, falling back to Main Camera. Click the preview to select that camera, or close it and restore it with the camera icon in the toolbar. Editor grids, handles, bounds, and helpers are omitted from the preview. This saved scene camera supplies the preview; the third-person controller continues to drive the gameplay camera.

- **RMB + WASD:** fly; **Q/E:** descend/ascend; **Shift:** faster; scroll while flying adjusts speed.
- **Alt + LMB:** orbit around the pivot.
- **MMB** or **Ctrl + Alt + LMB:** pan.
- **Scroll** or **Alt + RMB:** dolly.
- **F:** frame selection; double-click a mesh to select and frame it.
- **X/Y/Z:** axis views; **Reset view:** restore the camera.
- **Grid**, **Shaded/Wireframe**, and **Colliders:** viewport overlays.

Panel dividers can be dragged or focused and resized with arrow keys. Camera movement, selection, and panel sizes are session state, not saved level changes. Physics remains paused while editing. Browser/window-manager shortcuts may reserve Alt-drag gestures.

## Scene resources and storage

The version-3 scene format has parent-relative transforms, created-node definitions (prefab/primitive, name, material color, body type), source-instance deletion records, and per-node property overrides (visibility, lock, components, material and shadow flags, light color/intensity). Optional scene material and template-default maps extend the format while keeping older documents compatible. Version-1 and version-2 files migrate on load: version 2 stored transforms as if every group sat at the world origin, so they are re-based onto the group origins in `sceneOrigins.ts` without moving anything. Save writes version 3. Group origins are stable anchors; do not change one without migrating saved children. Obstacle defaults now live in `playgroundObstacles.json` with fixed UUIDs. The immutable `legacyObstacleIds.ts` map migrates old index-based edits. Never regenerate that map; adding or reordering defaults must preserve existing IDs. Other prefab source IDs also remain stable. The editor and runtime use `SceneObject` nodes, and internal geometry inherits its owner's transform. This follows the ownership/serialized-scene principle described by Godot's [Node documentation](https://docs.godotengine.org/en/stable/classes/class_node.html) and [editor tooling guidance](https://docs.godotengine.org/en/stable/tutorials/plugins/running_code_in_the_editor.html).

A development-only Vite middleware loads and atomically writes the one fixed scene file. It validates the document and rejects stale revisions to avoid silently overwriting another tab's save. Reload if another editor changed the file. The browser warns before closing a dirty scene. Save is available only through the local development server; no write endpoint is shipped in production.

Tests cover serialization, invalid input, atomic persistence/reload, stale-save rejection, preserving authored platform motion, hierarchy ownership/filtering, references after Play/Stop, and shared selection/picking. The editor exposes live physics diagnostics on its canvas for verification.

## Toolchain compatibility

Type checking uses TypeScript 7. Source-inspection tests use `typescript-compiler`, an alias of TypeScript 6, for the classic compiler API. The workspace Rapier override keeps the React wrapper on the same physics version as the direct dependency.
