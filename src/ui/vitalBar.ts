import { element } from "./dom.ts";

export type VitalBarProps = {
  label: string;
  value: number;
  max: number;
  stamina?: boolean;
  boss?: boolean;
};

export function mountVitalBar(parent: HTMLElement, initial: VitalBarProps) {
  const meter = element("div", "vital-bar");
  meter.setAttribute("role", "meter");
  const trail = element("span", "vital-trail");
  const fill = element("span", "vital-fill");
  meter.append(trail, fill);
  parent.append(meter);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let previous = Number.NaN;
  let lagging = Math.max(0, Math.min(initial.max, initial.value));
  const update = ({ label, value, max, stamina = false, boss = false }: VitalBarProps) => {
    const bounded = Math.max(0, Math.min(max, value));
    const fraction = (amount: number) => (max > 0 ? amount / max : 0);
    meter.classList.toggle("is-stamina", stamina);
    meter.classList.toggle("is-boss", boss);
    meter.setAttribute("aria-label", label);
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", String(max));
    meter.setAttribute("aria-valuenow", String(Math.round(bounded)));
    trail.hidden = stamina;
    fill.style.transform = `scaleX(${fraction(bounded)})`;
    trail.style.transform = `scaleX(${fraction(Math.min(max, Math.max(lagging, bounded)))})`;
    if (bounded !== previous) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        lagging = bounded;
        trail.style.transform = `scaleX(${fraction(bounded)})`;
      }, 650);
      previous = bounded;
    }
  };
  update(initial);
  return {
    update,
    dispose() {
      clearTimeout(timer);
      meter.remove();
    },
  };
}
