import { useNativeView } from "../hooks/useNativeView";
import { mountVitalBar, type VitalBarProps } from "../ui/vitalBar";

export function VitalBar(props: VitalBarProps) {
  const host = useNativeView(props, mountVitalBar);
  return <div ref={host} style={{ display: "contents" }} />;
}
