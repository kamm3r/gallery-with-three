import { useNativeView } from "../hooks/useNativeView";
import { gameStore } from "../runtime/gameStore";
import { mountZoneMap, type ZoneMapProps } from "../ui/zoneMap";

export function ZoneMap(props: ZoneMapProps) {
  const host = useNativeView(props, (parent, initial) => mountZoneMap(parent, gameStore, initial));
  return <div ref={host} style={{ display: "contents" }} />;
}
