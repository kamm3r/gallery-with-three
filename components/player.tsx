import * as THREE from 'three';
import React, { useEffect, useRef } from 'react';
import { useSphere } from '@react-three/cannon';
import { useThree, useFrame } from '@react-three/fiber';
import { useCharacterControls } from '../hooks/useCharacterControls';

const walkVelocity = 2;
const runVelocity = 5;
const direction = new THREE.Vector3();
const frontVector = new THREE.Vector3();
const sideVector = new THREE.Vector3();
const speed = new THREE.Vector3();
// const _decceleration = new THREE.Vector3(-0.0005, -0.0001, -5.0);
// const _acceleration = new THREE.Vector3(1, 0.25, 50.0);
// const _velocity = new THREE.Vector3(0, 0, 0);

export const Player = (props: any) => {
  const { camera } = useThree();
  const { forward, backward, left, right, run, jump } = useCharacterControls();
  const [ref, api]: any = useSphere(() => ({
    mass: 1,
    type: 'Dynamic',
    position: [0, 10, 0],
    ...props,
  }));

  const velocity = useRef([0, 0, 0]);

  useEffect(() => {
    const unsubscribe = api.velocity.subscribe(
      (v: any) => (velocity.current = v)
    );
    return unsubscribe;
  }, [api.velocity]);

  useFrame(() => {
    ref.current.getWorldPosition(camera.position);
    frontVector.set(0, 0, Number(backward) - Number(forward));
    sideVector.set(Number(left) - Number(right), 0, 0);
    direction
      .subVectors(frontVector, sideVector)
      .normalize()
      .multiplyScalar(run === true ? runVelocity : walkVelocity)
      .applyEuler(camera.rotation);
    speed.fromArray(velocity.current);

    api.velocity.set(direction.x, velocity.current[1], direction.z);

    if (jump && Math.abs(velocity.current[1]) < 0.001)
      api.velocity.set(velocity.current[0], 5, velocity.current[1]);
  });

  return (
    <>
      <mesh ref={ref} castShadow />
    </>
  );
};
