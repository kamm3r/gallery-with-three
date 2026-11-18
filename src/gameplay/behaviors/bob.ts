import type { SceneBehavior } from "../sceneBehaviorTypes.ts";
const bob: SceneBehavior = {
  name: "Bob",
  fields: { height: 0.5, frequency: 1 },
  update({ time, fields, position }) {
    position[1] += Math.sin(time * Math.PI * 2 * Number(fields.frequency)) * Number(fields.height);
  },
};
export default bob;
