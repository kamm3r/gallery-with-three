export function PlaybackControls({
  playing,
  paused,
  ready,
  play,
  stop,
  pause,
  step,
}: {
  playing: boolean;
  paused: boolean;
  ready: boolean;
  play: () => void;
  stop: () => void;
  pause: () => void;
  step: () => void;
}) {
  return (
    <div className="editor-playback" role="toolbar" aria-label="Playback controls">
      <button
        type="button"
        aria-label={playing ? "Stop" : "Play"}
        title={playing ? "Stop (Esc)" : "Play"}
        disabled={!ready}
        aria-pressed={playing}
        onClick={playing ? stop : play}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          {playing ? <path d="M4 4h8v8H4z" /> : <path d="M5 3l8 5-8 5z" />}
        </svg>
      </button>
      <button
        type="button"
        aria-label={paused ? "Resume" : "Pause"}
        title={paused ? "Resume" : "Pause"}
        disabled={!playing}
        aria-pressed={paused}
        onClick={pause}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 3h3v10H4zM9 3h3v10H9z" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Step simulation"
        title="Step simulation (1/60 second)"
        disabled={!playing || !paused}
        onClick={step}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 3l7 5-7 5zM11 3h2v10h-2z" />
        </svg>
      </button>
    </div>
  );
}
