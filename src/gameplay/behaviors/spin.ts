import type { SceneBehavior } from "../sceneBehaviorTypes.ts";
const spin: SceneBehavior = {
  name: "Spin",
  fields: { speed: 45, axis: "y" },
  update({ time, fields, rotation }) {
    const axis = fields.axis === "x" ? 0 : fields.axis === "z" ? 2 : 1;
    rotation[axis] += (time * Number(fields.speed) * Math.PI) / 180;
  },
};
export default spin;
