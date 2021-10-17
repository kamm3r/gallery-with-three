import { useFlexSize } from '@react-three/flex';
import { useLayoutEffect } from 'react';

export default function HeightReporter({ onReflow }: any) {
  const size = useFlexSize();
  useLayoutEffect(() => onReflow && onReflow(...size), [onReflow, size]);
  return null;
}
