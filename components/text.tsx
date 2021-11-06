import React from 'react';
import { useReflow } from '@react-three/flex';
import { Text } from '@react-three/drei';

export default function Texts({
  bold = false,
  anchorX = 'left',
  anchorY = 'top',
  textAlign = 'left',
  ...props
}: any) {
  const reflow = useReflow();
  const font = bold ? '/Inter-Bold.woff' : '/Inter-Regular.woff'; // fix this shit
  return (
    <Text
      anchorX={anchorX}
      anchorY={anchorY}
      textAlign={textAlign}
      font={font}
      onSync={reflow}
      {...props}
    />
  );
}
