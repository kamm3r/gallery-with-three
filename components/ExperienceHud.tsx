import type { PointerEvent } from 'react';
import { useGame } from '../app/gameSettings';
import { setPlayerControl, type ControlName } from '../hooks/usePlayerControls';

interface ExperienceHudProps {
  chapter: string;
  title: string;
  prompt?: string;
  leaving: boolean;
  ready: boolean;
}

function TouchButton({ control, label }: { control: ControlName; label: string }) {
  const setActive = (active: boolean) => (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setPlayerControl(control, active);
  };

  return (
    <button
      className={`touch-control touch-${control}`}
      type='button'
      aria-label={label}
      onPointerDown={setActive(true)}
      onPointerUp={setActive(false)}
      onPointerCancel={setActive(false)}
      onPointerLeave={setActive(false)}
    >
      {label}
    </button>
  );
}

export function ExperienceHud({ title, prompt, leaving, ready }: ExperienceHudProps) {
  const { paused } = useGame();
  return (
    <div className='hud' data-scene-ready={ready} inert={paused} aria-hidden={paused}>
      {ready && <header key={title} className='arrival-title' style={{ animationPlayState: paused ? 'paused' : 'running' }}>
        <h1>{title}</h1>
      </header>}
      <div className='touch-controls' aria-label='Touch controls'>
        <TouchButton control='forward' label='Up' />
        <TouchButton control='left' label='Left' />
        <TouchButton control='backward' label='Down' />
        <TouchButton control='right' label='Right' />
        <TouchButton control='jump' label='Jump' />
        <TouchButton control='roll' label='Roll' />
      </div>
      <div className={`portal-prompt ${prompt ? 'is-visible' : ''}`} role='status'>
        {prompt}
      </div>
      <div className={`loading-screen ${ready ? 'is-ready' : ''}`} role='status'>
        Loading world
      </div>
      <div className={`scene-curtain ${leaving ? 'is-leaving' : ''}`} />
    </div>
  );
}
