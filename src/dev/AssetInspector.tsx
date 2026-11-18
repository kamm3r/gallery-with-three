import { useEffect, useState } from "react";
import { assetThumbnail } from "./assetThumbnails";
import { assetSize, type AssetEntry } from "./assetTypes";
export function AssetInspector({
  asset,
  place,
  readOnly,
}: {
  asset: AssetEntry;
  place: () => void;
  readOnly: boolean;
}) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setThumbnail(null);
    if (asset.kind === "model")
      void assetThumbnail(asset).then((value) => {
        if (active) setThumbnail(value);
      });
    return () => {
      active = false;
    };
  }, [asset]);
  return (
    <section className="editor-panel editor-inspector asset-inspector" aria-label="Asset Inspector">
      <header className="editor-panel-header">
        <span>Inspector</span>
        <span className="editor-panel-count">{asset.kind}</span>
      </header>
      <div className="asset-inspector-body">
        <strong>{asset.name}</strong>
        <div className="asset-inspector-preview">
          {asset.kind === "image" ? (
            <img src={asset.url} alt={asset.name} />
          ) : thumbnail ? (
            <img src={thumbnail} alt={asset.name} />
          ) : (
            <span>{asset.kind === "audio" ? "♫" : "◇"}</span>
          )}
        </div>
        {asset.kind === "audio" && <audio controls preload="none" src={asset.url} />}
        <dl>
          <dt>Path</dt>
          <dd>Assets/{asset.path}</dd>
          <dt>Size</dt>
          <dd>{assetSize(asset.size)}</dd>
        </dl>
        {asset.kind === "model" && (
          <button className="asset-place-button" disabled={readOnly} onClick={place}>
            Add to Scene
          </button>
        )}
        <a href={asset.url} target="_blank" rel="noreferrer">
          Open asset ↗
        </a>
      </div>
    </section>
  );
}
