import assert from 'node:assert/strict';
import test from 'node:test';
import { Object3D } from 'three';
import { createGrassPatch } from '../gameplay/grass.ts';
import { grassMatrices } from '../gameplay/grassMatrices.ts';

test('worker matrices preserve the original grass positions, rotations, and density', () => {
  const blades = createGrassPatch(-3, 2, 60);
  const matrices = grassMatrices(-3, 2, 60);
  assert.equal(matrices.length, blades.length * 16);
  const transform = new Object3D();
  blades.forEach((blade, i) => {
    transform.position.set(blade.x, blade.y, blade.z);
    transform.rotation.set(0, blade.angle, 0);
    transform.scale.setScalar(blade.height);
    transform.updateMatrix();
    transform.matrix.elements.forEach((value, column) => {
      assert.ok(Math.abs(value - matrices[i * 16 + column]) < 0.00001);
    });
  });
});
