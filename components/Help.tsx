import { HTMLAttributes, useCallback, useEffect, useState } from 'react';
import { useCharacterControls } from '../hooks/useCharacterControls';

const controlOptions = [
  { keys: ['W'], action: 'Forward' },
  { keys: ['A'], action: 'Left' },
  { keys: ['D'], action: 'Right' },
  { keys: ['S'], action: 'Backward' },
  { keys: ['Space'], action: 'Jump' },
  { keys: ['Shift'], action: 'Run' },
];

export function Help(): JSX.Element {
  const [help, setHelp] = useState<any>(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code == 'KeyI') {
        setHelp(!help);
      }
    };
    document.addEventListener('keypress', handleKeyDown);

    return () => window.removeEventListener('keypress', handleKeyDown);
  }, [help, setHelp]);

  return (
    <section className='help'>
      {!help && <button onClick={() => setHelp({ help: false })}>i</button>}
      <div className={`popup ${help ? 'open' : ''}`}>
        <button className='popup-close' onClick={() => setHelp(!help)}>
          i
        </button>
        <div className='popup-content'>
          <Keys />
        </div>
      </div>
    </section>
  );
}
export function Keys(props: HTMLAttributes<HTMLUListElement>): JSX.Element {
  return (
    <ul {...props}>
      {controlOptions.map(({ keys, action }) => (
        <li className='popup-item' key={action}>
          <p>{action}</p>
          <div className='popup-item-keys'>
            {keys.map((key) => (
              <span className='popup-item-key' key={key}>
                <span>{key}</span>
              </span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
