import { swordHitActive } from './characterAnimations.ts';

export type BossPhase = 'approach' | 'windup' | 'strike' | 'recovery' | 'defeated';
export function createEncounter() {
  return {
    health: 100, stamina: 100, bossHealth: 300,
    playerX: 0, playerZ: 8, playerYaw: Math.PI,
    bossX: 0, bossZ: -7, bossYaw: 0,
    phase: 'approach' as BossPhase, timer: 0,
    attackTime: 0, attackId: 0, hitAttackId: 0, inputAttack: 0,
    invulnerable: false, hurtTime: 0,
  };
}
export type Encounter = ReturnType<typeof createEncounter>;

export function stepEncounter(state: Encounter, delta: number) {
  if (state.health <= 0 || state.bossHealth <= 0) {
    if (state.bossHealth <= 0) state.phase = 'defeated';
    return;
  }
  const dt = Math.min(delta,0.05);
  state.hurtTime = Math.max(0,state.hurtTime-dt);
  if (state.attackTime<=0 && !state.invulnerable) state.stamina=Math.min(100,state.stamina+22*dt);
  const dx=state.playerX-state.bossX, dz=state.playerZ-state.bossZ;
  const distance=Math.hypot(dx,dz);
  if (state.attackTime>0 && swordHitActive(state.attackId, state.attackTime) && state.attackId!==state.hitAttackId) {
    state.hitAttackId=state.attackId;
    const facing=(-dx*Math.sin(state.playerYaw)-dz*Math.cos(state.playerYaw))/Math.max(distance,.01);
    if (distance<3.4 && facing>0.1) state.bossHealth=Math.max(0,state.bossHealth-(state.phase==='recovery'?40:25));
  }
  if (state.bossHealth <= 0) { state.phase = 'defeated'; return; }
  const enraged=state.bossHealth<=150;
  state.timer+=dt;
  if (state.phase==='approach') {
    state.bossYaw=Math.atan2(dx,dz);
    if (distance>2.8) {
      const step=Math.min(distance-2.8,dt*(enraged?3.2:2.3));
      state.bossX+=dx/distance*step;state.bossZ+=dz/distance*step;
    } else {state.phase='windup';state.timer=0;}
  } else if(state.phase==='windup' && state.timer>(enraged?.65:1)) {
    state.phase='strike';state.timer=0;
    const frontal=(dx*Math.sin(state.bossYaw)+dz*Math.cos(state.bossYaw))/Math.max(distance,.01);
    if(distance<4.8 && frontal>0 && !state.invulnerable) {state.health=Math.max(0,state.health-25);state.hurtTime=.4;}
  } else if(state.phase==='strike' && state.timer>.2) {state.phase='recovery';state.timer=0;}
  else if(state.phase==='recovery' && state.timer>(enraged?1:1.6)) {state.phase='approach';state.timer=0;}
}
