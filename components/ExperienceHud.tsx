import type { PointerEvent } from 'react';
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

export function ExperienceHud({ chapter, title, prompt, leaving, ready }: ExperienceHudProps) {
  return (
    <div className='hud' data-scene-ready={ready}>
      <header className='world-title'>
        <p>{chapter}</p>
        <h1>{title}</h1>
      </header>
      <div className='keyboard-help' aria-label='Controls'>
        <span>WASD or arrows to move</span>
        <span>Drag to orbit camera</span>
        <span>Shift to run</span>
        <span>Space to jump</span>
      </div>
      <div className='touch-controls' aria-label='Touch controls'>
        <TouchButton control='forward' label='Up' />
        <TouchButton control='left' label='Left' />
        <TouchButton control='backward' label='Down' />
        <TouchButton control='right' label='Right' />
        <TouchButton control='jump' label='Jump' />
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
