import { useEffect } from "react";
import { gameStore } from "../runtime/gameStore";
import { mountInventoryBar } from "../ui/inventoryBar";
import { isResultScreenActive } from "../gameplay/resultScreen";
import { playSound } from "../gameplay/sound";

export function InventoryBar() {
  useEffect(
    () =>
      mountInventoryBar(document.body, {
        store: gameStore,
        resultScreenActive: isResultScreenActive,
        playSound,
      }),
    [],
  );
  return null;
}
