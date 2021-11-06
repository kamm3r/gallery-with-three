import * as THREE from 'three';
import { BoundsApi, BoundsProps, useBounds } from '@react-three/drei';
import { useEffect, useState } from 'react';

export default function SelectToZoom({ children }: BoundsProps) {
  const api = useBounds();
  const [active, activate] = useState();
  useEffect(() => void api.refresh(active).fit(), [api, active]);
  return (
    <group
      onClick={(e) => (
        e.stopPropagation(),
        e.delta <= 2 && activate(active === e.object ? null : e.object)
      )}
      onPointerMissed={(e) => activate(null)}
    >
      {children}
    </group>
  );
}
