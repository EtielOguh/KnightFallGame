import { createWavePlan, getFloorFarmConfig } from "./dungeon.js";

let runtimeSequence = 0;

export function createFarmRuntime(regionId, floor, config, options = {}) {
  runtimeSequence += 1;
  return {
    id: options.id || `farm_${regionId}_${floor}_${runtimeSequence}`,
    regionId,
    floor,
    expeditionId: options.expeditionId || null,
    waveIndex: 0,
    entitySequence: 0,
    spawnQueue: [],
    spawnTimer: Math.max(0, Number(options.initialDelay) || 0),
    breakTimer: 0,
    rewardedEnemyIds: new Set(),
    rewardClaimOrder: [],
    config
  };
}

function queueNextWave(runtime, random = Math.random) {
  runtime.waveIndex += 1;
  runtime.spawnQueue = createWavePlan(runtime.floor, runtime.config, random);
  runtime.breakTimer = 0;
  return [...runtime.spawnQueue];
}

export function updateFarmSpawner(runtime, dt, activeEnemyCount, random = Math.random) {
  const farm = runtime.config.farm || {};
  const band = getFloorFarmConfig(runtime.floor, runtime.config);
  if (runtime.waveIndex > 0 && !runtime.spawnQueue.length && activeEnemyCount === 0 && farm.continuous !== true) return null;
  if (!runtime.spawnQueue.length && activeEnemyCount === 0 && runtime.breakTimer <= 0) {
    runtime.breakTimer = runtime.waveIndex ? (runtime.floor === runtime.config.totalFloors ? farm.bossRespawnDelay : farm.waveBreak) || 2 : 0;
  }
  runtime.breakTimer = Math.max(0, runtime.breakTimer - Math.max(0, dt));
  runtime.spawnTimer = Math.max(0, runtime.spawnTimer - Math.max(0, dt));
  if (!runtime.spawnQueue.length && activeEnemyCount === 0 && runtime.breakTimer <= 0) queueNextWave(runtime, random);
  if (!runtime.spawnQueue.length || runtime.spawnTimer > 0 || activeEnemyCount >= band.maxActive) return null;
  runtime.entitySequence += 1;
  const roleId = runtime.spawnQueue.shift();
  runtime.spawnTimer = Math.max(.05, Number(farm.spawnDelay) || .5);
  return { id: `${runtime.id}_enemy_${runtime.entitySequence}`, roleId, waveIndex: runtime.waveIndex };
}

export function claimEnemyReward(runtime, enemyId) {
  if (!enemyId || runtime.rewardedEnemyIds.has(enemyId)) return false;
  runtime.rewardedEnemyIds.add(enemyId);
  runtime.rewardClaimOrder.push(enemyId);
  if (runtime.rewardClaimOrder.length > 512) {
    const expired = runtime.rewardClaimOrder.shift();
    runtime.rewardedEnemyIds.delete(expired);
  }
  return true;
}

export function addOwnedProjectile(projectiles, projectile, cap) {
  if (!projectile?.id || !projectile.ownerId || projectiles.some(entry => entry.id === projectile.id)) return false;
  if (projectiles.length >= Math.max(1, Number(cap) || 1)) return false;
  projectiles.push(projectile);
  return true;
}

export function removeOwnedProjectiles(projectiles, ownerId) {
  let removed = 0;
  for (let index = projectiles.length - 1; index >= 0; index -= 1) {
    if (projectiles[index].ownerId !== ownerId) continue;
    projectiles.splice(index, 1);
    removed += 1;
  }
  return removed;
}

export function activeEnemyCap(runtime) {
  return getFloorFarmConfig(runtime.floor, runtime.config).maxActive;
}
