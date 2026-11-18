import spin from "./behaviors/spin.ts";
import bob from "./behaviors/bob.ts";
import type { SceneBehavior } from "./sceneBehaviorTypes.ts";
/** Register trusted project modules here. Scenes serialize IDs and editable fields. */
export const sceneBehaviors: Record<string, SceneBehavior> = { spin, bob };
