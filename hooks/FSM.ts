import { useEffect, useRef, useState } from 'react';

export const FSM = () => {
  const [state, setState] = useState<any>({ state: 'Idle' });
  const prevState = useRef('');

  useEffect(() => {
    prevState.current = state;
  }, [state]);
};

const States = {
  Idle: {},
  PickUp: {},
  Punch: {},
  RecieveHit: {},
  Run: {},
  SitDown: {},
  Walk: {},
};
//FFFFFFFFFFFFFFFFFFFFFFFFFFFf
//doesnt work
// const _addState = (name: string, type: any) => {
//   setStates((states[name] = type));
// };
// const UpdateState = (timeElapsed: any, input: any) => {
//   setStates(states.update(timeElapsed, input));
// };
