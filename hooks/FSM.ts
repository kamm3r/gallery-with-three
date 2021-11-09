import { useState } from 'react';

const FSM = () => {
  const [states, setStates] = useState<any>({});

  const _addState = (name: string, type: any) => {
    setStates((states[name] = type));
  };
  const UpdateState = (timeElapsed: any, input: any) => {
    setStates(states.update(timeElapsed, input));
  };
};

//FFFFFFFFFFFFFFFFFFFFFFFFFFFf
//doesnt work
