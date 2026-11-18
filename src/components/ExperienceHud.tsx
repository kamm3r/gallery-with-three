import { useNativeView } from "../hooks/useNativeView";
import { gameStore } from "../runtime/gameStore";
import { mountExperienceHud, type ExperienceHudProps } from "../ui/experienceHud";
import { setPlayerControl } from "../runtime/playerInput";

export function ExperienceHud(props: ExperienceHudProps) {
  const host = useNativeView(props, (parent, initial) =>
    mountExperienceHud(parent, gameStore, initial, setPlayerControl),
  );
  return <div ref={host} style={{ display: "contents" }} />;
}
