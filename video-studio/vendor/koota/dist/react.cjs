"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/react.ts
var react_exports = {};
__export(react_exports, {
  WorldProvider: () => WorldProvider,
  useActions: () => useActions,
  useHas: () => useHas,
  useQuery: () => useQuery,
  useQueryFirst: () => useQueryFirst,
  useTag: () => useTag,
  useTarget: () => useTarget,
  useTargets: () => useTargets,
  useTrait: () => useTrait,
  useTraitEffect: () => useTraitEffect,
  useWorld: () => useWorld
});
module.exports = __toCommonJS(react_exports);

// ../react/src/world/use-world.ts
var import_react2 = require("react");

// ../react/src/world/world-context.ts
var import_react = require("react");
var WorldContext = (0, import_react.createContext)(null);

// ../react/src/world/use-world.ts
function useWorld() {
  const world = (0, import_react2.useContext)(WorldContext);
  if (!world) {
    throw new Error("Koota: useWorld must be used within a WorldProvider");
  }
  return world;
}

// ../react/src/hooks/use-actions.ts
function useActions(actions) {
  const world = useWorld();
  return actions(world);
}

// ../core/src/common.ts
var $internal = Symbol.for("koota.internal");

// ../core/src/entity/utils/pack-entity.ts
var WORLD_ID_BITS = 4;
var GENERATION_BITS = 8;
var ENTITY_ID_BITS = 20;
var WORLD_ID_MASK = (1 << WORLD_ID_BITS) - 1;
var GENERATION_MASK = (1 << GENERATION_BITS) - 1;
var ENTITY_ID_MASK = (1 << ENTITY_ID_BITS) - 1;
var GENERATION_SHIFT = ENTITY_ID_BITS;
var WORLD_ID_SHIFT = GENERATION_SHIFT + GENERATION_BITS;

// ../core/src/utils/shallow-equal.ts
function shallowEqual(obj1, obj2) {
  return obj1 === obj2 || typeof obj1 === "object" && obj1 !== null && typeof obj2 === "object" && obj2 !== null && (() => {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    return keys1.length === keys2.length && keys1.every((key) => Object.hasOwn(obj2, key) && obj1[key] === obj2[key]);
  })();
}

// ../core/src/relation/symbols.ts
var $relationPair = Symbol.for("relationPair");
var $relation = Symbol.for("relation");
var $orderedTargetsTrait = Symbol.for("orderedTargetsTrait");

// ../core/src/world/utils/world-index.ts
function createWorldIndex() {
  return {
    worldCursor: 0,
    releasedWorldIds: [],
    maxWorlds: 2 ** WORLD_ID_BITS
  };
}

// ../core/src/universe/universe.ts
var universe = {
  worlds: [],
  cachedQueries: /* @__PURE__ */ new Map(),
  worldIndex: createWorldIndex(),
  reset: () => {
    universe.worlds = [];
    universe.cachedQueries = /* @__PURE__ */ new Map();
    universe.worldIndex = createWorldIndex();
  }
};

// ../core/src/query/modifier.ts
var $modifier = Symbol("modifier");

// ../core/src/query/symbols.ts
var $parameters = Symbol.for("parameters");
var $queryRef = Symbol.for("queryRef");

// ../core/src/query/utils/check-query.ts
function checkQuery(world, query, entity) {
  const staticBitmasks = query.staticBitmasks;
  const generations = query.generations;
  const ctx = world[$internal];
  const eid = entity & ENTITY_ID_MASK;
  if (query.traitInstances.all.length === 0) return false;
  for (let i = 0; i < generations.length; i++) {
    const generationId = generations[i];
    const bitmask = staticBitmasks[i];
    if (!bitmask) continue;
    const required = bitmask.required;
    const forbidden = bitmask.forbidden;
    const or = bitmask.or;
    const entityMask = ctx.entityMasks[generationId]?.[eid] || 0;
    if (!forbidden && !required && !or) return false;
    if (forbidden && (entityMask & forbidden) !== 0) return false;
    if (required && (entityMask & required) !== required) return false;
    if (or !== 0 && (entityMask & or) === 0) return false;
  }
  return true;
}

// ../core/src/query/utils/check-query-with-relations.ts
function checkQueryWithRelations(world, query, entity) {
  if (!checkQuery(world, query, entity)) return false;
  if (query.relationFilters && query.relationFilters.length > 0) {
    for (const pair of query.relationFilters) {
      if (pair.targetQueryMatches) {
        if (!hasRelationTargetInSet(world, pair.relation, entity, pair.targetQueryMatches)) {
          return false;
        }
        continue;
      }
      if (!hasRelationPair(world, entity, pair)) {
        return false;
      }
    }
  }
  return true;
}

// ../core/src/relation/relation.ts
var EMPTY_ENTITY_ARRAY = Object.freeze([]);
function addToRelationSources(traitData, entity, target) {
  const buckets = traitData.relationSourcesByTarget ??= [];
  const bucket = buckets[target & ENTITY_ID_MASK] ??= [];
  bucket.push(entity);
}
function removeFromRelationSources(traitData, entity, target) {
  const bucket = traitData.relationSourcesByTarget?.[target & ENTITY_ID_MASK];
  if (!bucket) return;
  const idx = bucket.indexOf(entity);
  if (idx === -1) return;
  const last = bucket.length - 1;
  if (idx !== last) bucket[idx] = bucket[last];
  bucket.pop();
}
function addRelationTarget(world, relation2, entity, target) {
  const ctx = world[$internal];
  const relationCtx = relation2[$internal];
  const baseTrait = relationCtx.trait;
  const traitData = ctx.traitInstances[baseTrait.id];
  if (!traitData) return -1;
  if (!traitData.relationTargets) {
    traitData.relationTargets = [];
  }
  const eid = entity & ENTITY_ID_MASK;
  let targetIndex;
  if (relationCtx.exclusive) {
    const targets = traitData.relationTargets;
    const previousTarget = targets[eid];
    if (previousTarget === target) return -1;
    if (previousTarget !== void 0) {
      removeFromRelationSources(traitData, entity, previousTarget);
    }
    targets[eid] = target;
    targetIndex = 0;
  } else {
    const targetsArray = traitData.relationTargets;
    if (!targetsArray[eid]) {
      targetsArray[eid] = [];
    }
    const existingIndex = targetsArray[eid].indexOf(target);
    if (existingIndex !== -1) {
      return -1;
    }
    targetIndex = targetsArray[eid].length;
    targetsArray[eid].push(target);
  }
  addToRelationSources(traitData, entity, target);
  updateQueriesForRelationChange(world, relation2, entity);
  return targetIndex;
}
function removeRelationTarget(world, relation2, entity, target) {
  const ctx = world[$internal];
  const relationCtx = relation2[$internal];
  const relationTrait = relationCtx.trait;
  const data = ctx.traitInstances[relationTrait.id];
  if (!data || !data.relationTargets) return {
    removedIndex: -1,
    wasLastTarget: false
  };
  const eid = entity & ENTITY_ID_MASK;
  let removedIndex = -1;
  let hasRemainingTargets = false;
  if (relationCtx.exclusive) {
    const targets = data.relationTargets;
    if (targets[eid] === target) {
      removeFromRelationSources(data, entity, target);
      targets[eid] = void 0;
      removedIndex = 0;
      hasRemainingTargets = false;
      clearRelationDataInternal(data.store, relationTrait[$internal].type, eid, 0, true);
    }
  } else {
    const targetsArray = data.relationTargets;
    const entityTargets = targetsArray[eid];
    if (entityTargets) {
      const idx = entityTargets.indexOf(target);
      if (idx !== -1) {
        const lastIdx = entityTargets.length - 1;
        removeFromRelationSources(data, entity, target);
        if (idx !== lastIdx) entityTargets[idx] = entityTargets[lastIdx];
        entityTargets.pop();
        swapAndPopRelationData(data.store, relationTrait[$internal].type, eid, idx, lastIdx);
        removedIndex = idx;
        hasRemainingTargets = entityTargets.length > 0;
      }
    }
  }
  if (removedIndex !== -1) updateQueriesForRelationChange(world, relation2, entity);
  const wasLastTarget = removedIndex !== -1 && !hasRemainingTargets;
  return {
    removedIndex,
    wasLastTarget
  };
}
function updateQueriesForRelationChange(world, relation2, entity) {
  const ctx = world[$internal];
  const baseTrait = relation2[$internal].trait;
  const traitData = ctx.traitInstances[baseTrait.id];
  if (!traitData) return;
  for (const query of traitData.relationQueries) {
    const match = checkQueryWithRelations(world, query, entity);
    if (match) {
      query.add(entity);
    } else {
      query.remove(world, entity);
    }
  }
}
function swapAndPopRelationData(store, type, eid, idx, lastIdx) {
  if (type === "aos") {
    const arr = store[eid];
    if (arr) {
      if (idx !== lastIdx) arr[idx] = arr[lastIdx];
      arr.pop();
    }
  } else {
    for (const key in store) {
      const arr = store[key][eid];
      if (arr) {
        if (idx !== lastIdx) arr[idx] = arr[lastIdx];
        arr.pop();
      }
    }
  }
}
function clearRelationDataInternal(store, type, eid, _idx, exclusive) {
  if (!exclusive) return;
  if (type === "aos") {
    store[eid] = void 0;
  } else {
    for (const key in store) {
      store[key][eid] = void 0;
    }
  }
}
function removeAllRelationTargets(world, relation2, entity) {
  let result_getRelationTargets_16_$f;
  const ctx_16_$f = world[$internal];
  const relationCtx_16_$f = relation2[$internal];
  const traitData_16_$f = ctx_16_$f.traitInstances[relationCtx_16_$f.trait.id];
  if (!traitData_16_$f || !traitData_16_$f.relationTargets) {
    result_getRelationTargets_16_$f = [];
  } else {
    const eid_16_$f = entity & ENTITY_ID_MASK;
    if (relationCtx_16_$f.exclusive) {
      const target_16_$f = traitData_16_$f.relationTargets[eid_16_$f];
      result_getRelationTargets_16_$f = target_16_$f !== void 0 ? [target_16_$f] : [];
    } else {
      const targets_16_$f = traitData_16_$f.relationTargets[eid_16_$f];
      result_getRelationTargets_16_$f = targets_16_$f !== void 0 ? targets_16_$f.slice() : [];
    }
  }
  const targets = result_getRelationTargets_16_$f;
  for (const target of targets) {
    removeRelationTarget(world, relation2, entity, target);
  }
}
function getEntitiesWithRelationTo(world, relation2, target) {
  const ctx = world[$internal];
  if (!world.has(target)) return EMPTY_ENTITY_ARRAY;
  const baseTrait = relation2[$internal].trait;
  const traitData = ctx.traitInstances[baseTrait.id];
  if (!traitData?.relationSourcesByTarget) return EMPTY_ENTITY_ARRAY;
  return traitData.relationSourcesByTarget[target & ENTITY_ID_MASK]?.slice() ?? EMPTY_ENTITY_ARRAY;
}
function hasRelationTargetInSet(world, relation2, entity, matches) {
  const ctx = world[$internal];
  const relationCtx = relation2[$internal];
  const traitData = ctx.traitInstances[relationCtx.trait.id];
  if (!traitData?.relationTargets) return false;
  const eid = entity & ENTITY_ID_MASK;
  if (relationCtx.exclusive) {
    const target = traitData.relationTargets[eid];
    return target !== void 0 && matches.has(target);
  }
  const targets = traitData.relationTargets[eid];
  if (!targets) return false;
  for (let i = 0; i < targets.length; i++) {
    if (matches.has(targets[i])) return true;
  }
  return false;
}
function setRelationDataAtIndex(world, entity, relation2, targetIndex, value) {
  const relationCtx = relation2[$internal];
  const baseTrait = relationCtx.trait;
  const traitData = world[$internal].traitInstances[baseTrait.id];
  if (!traitData) return;
  const store = traitData.store;
  const eid = entity & ENTITY_ID_MASK;
  if (baseTrait[$internal].type === "aos") {
    if (relationCtx.exclusive) {
      store[eid] = value;
    } else {
      (store[eid] ??= [])[targetIndex] = value;
    }
    return;
  }
  if (relationCtx.exclusive) {
    for (const key in value) {
      store[key][eid] = value[key];
    }
  } else {
    for (const key in value) {
      (store[key][eid] ??= [])[targetIndex] = value[key];
    }
  }
}
function setRelationData(world, entity, relation2, target, value) {
  let result_getTargetIndex_23_$f;
  const ctx_23_$f = world[$internal];
  const relationCtx_23_$f = relation2[$internal];
  const baseTrait_23_$f = relationCtx_23_$f.trait;
  const traitData_23_$f = ctx_23_$f.traitInstances[baseTrait_23_$f.id];
  if (!traitData_23_$f || !traitData_23_$f.relationTargets) {
    result_getTargetIndex_23_$f = -1;
  } else {
    const eid_23_$f = entity & ENTITY_ID_MASK;
    if (relationCtx_23_$f.exclusive) {
      result_getTargetIndex_23_$f = traitData_23_$f.relationTargets[eid_23_$f] === target ? 0 : -1;
    } else {
      const targets_23_$f = traitData_23_$f.relationTargets[eid_23_$f];
      result_getTargetIndex_23_$f = targets_23_$f ? targets_23_$f.indexOf(target) : -1;
    }
  }
  const targetIndex = result_getTargetIndex_23_$f;
  if (targetIndex === -1) return;
  setRelationDataAtIndex(world, entity, relation2, targetIndex, value);
}
function getRelationData(world, entity, relation2, target) {
  const ctx = world[$internal];
  const baseTrait = relation2[$internal].trait;
  const traitData = ctx.traitInstances[baseTrait.id];
  if (!traitData) return void 0;
  let result_getTargetIndex_25_$f;
  const ctx_25_$f = world[$internal];
  const relationCtx_25_$f = relation2[$internal];
  const baseTrait_25_$f = relationCtx_25_$f.trait;
  const traitData_25_$f = ctx_25_$f.traitInstances[baseTrait_25_$f.id];
  if (!traitData_25_$f || !traitData_25_$f.relationTargets) {
    result_getTargetIndex_25_$f = -1;
  } else {
    const eid_25_$f = entity & ENTITY_ID_MASK;
    if (relationCtx_25_$f.exclusive) {
      result_getTargetIndex_25_$f = traitData_25_$f.relationTargets[eid_25_$f] === target ? 0 : -1;
    } else {
      const targets_25_$f = traitData_25_$f.relationTargets[eid_25_$f];
      result_getTargetIndex_25_$f = targets_25_$f ? targets_25_$f.indexOf(target) : -1;
    }
  }
  const targetIndex = result_getTargetIndex_25_$f;
  if (targetIndex === -1) return void 0;
  const traitCtx = baseTrait[$internal];
  const store = traitData.store;
  const eid = entity & ENTITY_ID_MASK;
  const relationCtx = relation2[$internal];
  if (traitCtx.type === "aos") {
    if (relationCtx.exclusive) {
      return store[eid];
    } else {
      return store[eid]?.[targetIndex];
    }
  } else {
    const result = {};
    const storeRecord = store;
    for (const key in store) {
      if (relationCtx.exclusive) {
        result[key] = storeRecord[key][eid];
      } else {
        result[key] = storeRecord[key][eid]?.[targetIndex];
      }
    }
    return result;
  }
}
function hasRelationPair(world, entity, pair) {
  const relation2 = pair.relation;
  const target = pair.target;
  const targetQuery = pair.targetQuery;
  if (!hasTrait(world, entity, relation2[$internal].trait)) return false;
  if (targetQuery) {
    const matchingTargets = targetQuery?.[$queryRef] ? world.query(targetQuery) : world.query(...targetQuery);
    if (!matchingTargets.length) return false;
    let result_getRelationTargets_28_$f;
    const ctx_28_$f = world[$internal];
    const relationCtx_28_$f = relation2[$internal];
    const traitData_28_$f = ctx_28_$f.traitInstances[relationCtx_28_$f.trait.id];
    if (!traitData_28_$f || !traitData_28_$f.relationTargets) {
      result_getRelationTargets_28_$f = [];
    } else {
      const eid_28_$f = entity & ENTITY_ID_MASK;
      if (relationCtx_28_$f.exclusive) {
        const target_28_$f = traitData_28_$f.relationTargets[eid_28_$f];
        result_getRelationTargets_28_$f = target_28_$f !== void 0 ? [target_28_$f] : [];
      } else {
        const targets_28_$f = traitData_28_$f.relationTargets[eid_28_$f];
        result_getRelationTargets_28_$f = targets_28_$f !== void 0 ? targets_28_$f.slice() : [];
      }
    }
    const targets = result_getRelationTargets_28_$f;
    for (let i = 0; i < targets.length; i++) {
      if (matchingTargets.includes(targets[i])) return true;
    }
    return false;
  }
  if (target === "*") return true;
  if (typeof target === "number") {
    let result_hasRelationToTarget_29_$f;
    const ctx_29_$f = world[$internal];
    const relationCtx_29_$f = relation2[$internal];
    const baseTrait_29_$f = relationCtx_29_$f.trait;
    const traitData_29_$f = ctx_29_$f.traitInstances[baseTrait_29_$f.id];
    if (!traitData_29_$f || !traitData_29_$f.relationTargets) {
      result_hasRelationToTarget_29_$f = false;
    } else {
      const eid_29_$f = entity & ENTITY_ID_MASK;
      if (relationCtx_29_$f.exclusive) {
        result_hasRelationToTarget_29_$f = traitData_29_$f.relationTargets[eid_29_$f] === target;
      } else {
        const targets_29_$f = traitData_29_$f.relationTargets[eid_29_$f];
        result_hasRelationToTarget_29_$f = targets_29_$f ? targets_29_$f.includes(target) : false;
      }
    }
    return result_hasRelationToTarget_29_$f;
  }
  return false;
}

// ../core/src/query/utils/check-query-tracking.ts
function checkQueryTracking(world, query, entity, eventType, eventGenerationId, eventBitflag) {
  const staticBitmasks = query.staticBitmasks;
  const trackingGroups = query.trackingGroups;
  const generations = query.generations;
  const traitInstancesAll = query.traitInstances.all;
  const entityMasks = world[$internal].entityMasks;
  const eid = entity & ENTITY_ID_MASK;
  const generationsLen = generations.length;
  const trackingGroupsLen = trackingGroups.length;
  if (traitInstancesAll.length === 0) return false;
  for (let i = 0; i < generationsLen; i++) {
    const generationId = generations[i];
    const bitmask = staticBitmasks[i];
    if (!bitmask) continue;
    const required = bitmask.required;
    const forbidden = bitmask.forbidden;
    const or = bitmask.or;
    const genMasks = entityMasks[generationId];
    const entityMask = genMasks ? genMasks[eid] | 0 : 0;
    if (forbidden && (entityMask & forbidden) !== 0) return false;
    if (required && (entityMask & required) !== required) return false;
    if (or !== 0 && (entityMask & or) === 0) return false;
  }
  let hasOrGroup = false;
  let anyOrMatched = false;
  for (let i = 0; i < trackingGroupsLen; i++) {
    const group = trackingGroups[i];
    const groupType = group.type;
    const groupLogic = group.logic;
    const groupBitmasks = group.bitmasks;
    const groupBitmask = groupBitmasks[eventGenerationId];
    if (groupBitmask && groupBitmask & eventBitflag) {
      if (eventType === "remove") {
        if (groupType === "add" || groupType === "change") return false;
      } else if (eventType === "add") {
        if (groupType === "remove" || groupType === "change") return false;
      }
      if (groupType === eventType) {
        if (eventType === "change") {
          const genMasks = entityMasks[eventGenerationId];
          const entityMask = genMasks ? genMasks[eid] | 0 : 0;
          if (!(entityMask & eventBitflag)) return false;
        }
        const groupTrackers = group.trackers;
        let trackerArr = groupTrackers[eventGenerationId];
        if (!trackerArr) {
          trackerArr = [];
          groupTrackers[eventGenerationId] = trackerArr;
        }
        trackerArr[eid] = trackerArr[eid] | 0 | eventBitflag;
      }
    }
    if (groupLogic === "or") {
      hasOrGroup = true;
      if (!anyOrMatched) {
        const groupTrackers = group.trackers;
        const bitmaskLen = groupBitmasks.length;
        for (let genId = 0; genId < bitmaskLen; genId++) {
          const mask = groupBitmasks[genId];
          if (!mask) continue;
          const trackerArr = groupTrackers[genId];
          const tracker = trackerArr ? trackerArr[eid] | 0 : 0;
          if (tracker & mask) {
            anyOrMatched = true;
            break;
          }
        }
      }
    } else {
      const groupTrackers = group.trackers;
      const bitmaskLen = groupBitmasks.length;
      for (let genId = 0; genId < bitmaskLen; genId++) {
        const mask = groupBitmasks[genId];
        if (!mask) continue;
        const trackerArr = groupTrackers[genId];
        const tracker = trackerArr ? trackerArr[eid] | 0 : 0;
        if ((tracker & mask) !== mask) {
          return false;
        }
      }
    }
  }
  if (hasOrGroup && !anyOrMatched) {
    return false;
  }
  return true;
}

// ../core/src/query/utils/check-query-tracking-with-relations.ts
function checkQueryTrackingWithRelations(world, query, entity, eventType, eventGenerationId, eventBitflag) {
  if (!checkQueryTracking(world, query, entity, eventType, eventGenerationId, eventBitflag)) {
    return false;
  }
  if (query.relationFilters && query.relationFilters.length > 0) {
    for (const pair of query.relationFilters) {
      if (pair.targetQueryMatches) {
        if (!hasRelationTargetInSet(world, pair.relation, entity, pair.targetQueryMatches)) {
          return false;
        }
        continue;
      }
      if (!hasRelationPair(world, entity, pair)) {
        return false;
      }
    }
  }
  return true;
}

// ../core/src/relation/ordered.ts
function setupOrderedTraitSync(world, orderedTrait) {
  const ctx = world[$internal];
  const relation2 = orderedTrait[$orderedTargetsTrait].relation;
  const relationTrait = relation2[$internal].trait;
  const orderedInstance = ctx.traitInstances[orderedTrait.id];
  if (!orderedInstance) return;
  let relationInstance = ctx.traitInstances[relationTrait.id];
  if (!relationInstance) {
    registerTrait(world, relationTrait);
    relationInstance = ctx.traitInstances[relationTrait.id];
  }
  const {
    generationId,
    bitflag,
    store
  } = orderedInstance;
  const {
    entityMasks,
    entityIndex
  } = ctx;
  const traitCtx = orderedTrait[$internal];
  const getList = (parent) => {
    const eid = parent & ENTITY_ID_MASK;
    return entityMasks[generationId]?.[eid] & bitflag ? traitCtx.get(eid, store) : void 0;
  };
  relationInstance.addSubscriptions.add((child, parent) => {
    getList(parent)?._appendWithoutSync(child);
  });
  relationInstance.removeSubscriptions.add((child, parent) => {
    const eid = parent & ENTITY_ID_MASK;
    const denseIdx = entityIndex.sparse[eid];
    if (denseIdx !== void 0 && (entityIndex.dense[denseIdx] & ENTITY_ID_MASK) === eid) {
      getList(parent)?._removeWithoutSync(child);
    }
  });
}

// ../core/src/relation/ordered-list.ts
var OrderedList = class extends Array {
  world;
  parent;
  relation;
  orderedTrait;
  _syncing = false;
  constructor(world, parent, relation2, orderedTrait, items = []) {
    super(...items);
    this.world = world;
    this.parent = parent;
    this.relation = relation2;
    this.orderedTrait = orderedTrait;
  }
  get [Symbol.toStringTag]() {
    return "OrderedList";
  }
  /**
   * Add entities to the end of the list and add relation pairs.
   */
  push(...items) {
    this._syncing = true;
    try {
      for (const item of items) {
        addTrait(this.world, item, this.relation(this.parent));
      }
      const result = super.push(...items);
      setChanged(this.world, this.parent, this.orderedTrait);
      return result;
    } finally {
      this._syncing = false;
    }
  }
  /**
   * Remove and return the last entity, removing its relation pair.
   */
  pop() {
    this._syncing = true;
    try {
      const item = super.pop();
      if (item !== void 0) {
        removeTrait(this.world, item, this.relation(this.parent));
        setChanged(this.world, this.parent, this.orderedTrait);
      }
      return item;
    } finally {
      this._syncing = false;
    }
  }
  /**
   * Remove and return the first entity, removing its relation pair.
   */
  shift() {
    this._syncing = true;
    try {
      const item = super.shift();
      if (item !== void 0) {
        removeTrait(this.world, item, this.relation(this.parent));
        setChanged(this.world, this.parent, this.orderedTrait);
      }
      return item;
    } finally {
      this._syncing = false;
    }
  }
  /**
   * Add entities to the beginning of the list and add relation pairs.
   */
  unshift(...items) {
    this._syncing = true;
    try {
      for (const item of items) {
        addTrait(this.world, item, this.relation(this.parent));
      }
      const result = super.unshift(...items);
      setChanged(this.world, this.parent, this.orderedTrait);
      return result;
    } finally {
      this._syncing = false;
    }
  }
  /**
   * Remove and/or insert entities, syncing relation pairs.
   */
  splice(start, deleteCount, ...items) {
    this._syncing = true;
    try {
      const removed = super.splice(start, deleteCount ?? 0, ...items);
      for (const item of removed) {
        removeTrait(this.world, item, this.relation(this.parent));
      }
      for (const item of items) {
        addTrait(this.world, item, this.relation(this.parent));
      }
      if (removed.length > 0 || items.length > 0) {
        setChanged(this.world, this.parent, this.orderedTrait);
      }
      return removed;
    } finally {
      this._syncing = false;
    }
  }
  /**
   * Sort the list in place. Does not modify relations.
   */
  sort(compareFn) {
    super.sort(compareFn);
    setChanged(this.world, this.parent, this.orderedTrait);
    return this;
  }
  /**
   * Reverse the list in place. Does not modify relations.
   */
  reverse() {
    super.reverse();
    setChanged(this.world, this.parent, this.orderedTrait);
    return this;
  }
  /**
   * Override map to return a plain array instead of OrderedList.
   */
  map(callbackfn) {
    return Array.prototype.map.call(this, callbackfn);
  }
  /**
   * Override filter to return a plain array instead of OrderedList.
   */
  filter(predicate) {
    return Array.prototype.filter.call(this, predicate);
  }
  /**
   * Override slice to return a plain array instead of OrderedList.
   */
  slice(start, end) {
    return Array.prototype.slice.call(this, start, end);
  }
  /**
   * Move an entity to a specific index in the list.
   * Does not modify the relation, only reorders.
   */
  moveTo(item, toIndex) {
    const fromIndex = this.indexOf(item);
    if (fromIndex === -1) {
      throw new Error("Item not found in OrderedList");
    }
    if (fromIndex === toIndex) return;
    super.splice(fromIndex, 1);
    super.splice(toIndex, 0, item);
    setChanged(this.world, this.parent, this.orderedTrait);
  }
  /**
   * Insert an entity at a specific index and add its relation pair.
   */
  insert(item, index) {
    this._syncing = true;
    try {
      addTrait(this.world, item, this.relation(this.parent));
      super.splice(index, 0, item);
      setChanged(this.world, this.parent, this.orderedTrait);
    } finally {
      this._syncing = false;
    }
  }
  /**
   * Internal method to append without triggering relation add.
   * Used by the sync system when a relation is added externally.
   */
  _appendWithoutSync(item) {
    if (!this._syncing) {
      super.push(item);
      setChanged(this.world, this.parent, this.orderedTrait);
    }
  }
  /**
   * Internal method to remove without triggering relation remove.
   * Used by the sync system when a relation is removed externally.
   */
  _removeWithoutSync(item) {
    if (!this._syncing) {
      const index = this.indexOf(item);
      if (index !== -1) {
        super.splice(index, 1);
        setChanged(this.world, this.parent, this.orderedTrait);
      }
    }
  }
};

// ../core/src/storage/stores.ts
function createStore(schema) {
  if (typeof schema === "function") {
    return [];
  } else {
    const store = {};
    for (const key in schema) {
      store[key] = [];
    }
    return store;
  }
}

// ../core/src/storage/accessors.ts
// [ISPO vendored patch] The four SoA accessor factories below were rewritten
// from `new Function` code generation to semantically identical closures,
// because generated-code evaluation is refused by the sandboxed project-frame
// CSP (script-src 'self' 'wasm-unsafe-eval'). See PROVENANCE.json.
function createSoASetFunction(schema) {
  const keys = Object.keys(schema);
  const set = (index, store, value) => {
    for (const key of keys) {
      if (key in value) store[key][index] = value[key];
    }
  };
  return set;
}
function createSoAFastSetFunction(schema) {
  const keys = Object.keys(schema);
  const set = (index, store, value) => {
    for (const key of keys) {
      store[key][index] = value[key];
    }
  };
  return set;
}
function createSoAFastSetChangeFunction(schema) {
  const keys = Object.keys(schema);
  const set = (index, store, value) => {
    let changed = false;
    for (const key of keys) {
      if (store[key][index] !== value[key]) {
        store[key][index] = value[key];
        changed = true;
      }
    }
    return changed;
  };
  return set;
}
function createSoAGetFunction(schema) {
  const keys = Object.keys(schema);
  const get = (index, store) => {
    const value = {};
    for (const key of keys) {
      value[key] = store[key][index];
    }
    return value;
  };
  return get;
}
function createAoSSetFunction(_schema) {
  return (index, store, value) => {
    store[index] = value;
  };
}
function createAoSFastSetChangeFunction(_schema) {
  return (index, store, value) => {
    let changed = false;
    if (value !== store[index]) {
      store[index] = value;
      changed = true;
    }
    return changed;
  };
}
function createAoSGetFunction(_schema) {
  return (index, store) => store[index];
}
var noop = () => {
};
var createTagNoop = () => noop;
var createSetFunction = {
  soa: createSoASetFunction,
  aos: createAoSSetFunction,
  tag: createTagNoop
};
var createFastSetFunction = {
  soa: createSoAFastSetFunction,
  aos: createAoSSetFunction,
  tag: createTagNoop
};
var createFastSetChangeFunction = {
  soa: createSoAFastSetChangeFunction,
  aos: createAoSFastSetChangeFunction,
  tag: createTagNoop
};
var createGetFunction = {
  soa: createSoAGetFunction,
  aos: createAoSGetFunction,
  tag: createTagNoop
};

// ../core/src/trait/trait.ts
var tagSchema = Object.freeze({});
var traitId = 0;
function createTrait(schema = tagSchema) {
  const isAoS = typeof schema === "function";
  const isTag = !isAoS && Object.keys(schema).length === 0;
  const traitType = isAoS ? "aos" : isTag ? "tag" : "soa";
  for (const key_0_$f in schema) {
    const value_0_$f = schema[key_0_$f];
    if (value_0_$f !== null && typeof value_0_$f === "object") {
      const kind_0_$f = Array.isArray(value_0_$f) ? "array" : "object";
      throw new Error(`Koota: ${key_0_$f} is an ${kind_0_$f}, which is not supported in traits.`);
    }
  }
  const id = traitId++;
  const Trait = Object.assign((params) => [Trait, params], {
    [$internal]: {
      id,
      set: createSetFunction[traitType](schema),
      fastSet: createFastSetFunction[traitType](schema),
      fastSetWithChangeDetection: createFastSetChangeFunction[traitType](schema),
      get: createGetFunction[traitType](schema),
      createStore: () => createStore(schema),
      relation: null,
      type: traitType
    }
  });
  Object.defineProperty(Trait, "id", {
    value: id,
    writable: false,
    enumerable: true,
    configurable: false
  });
  Object.defineProperty(Trait, "schema", {
    value: schema,
    writable: false,
    enumerable: true,
    configurable: false
  });
  return Trait;
}
var trait = createTrait;
function registerTrait(world, trait2) {
  const ctx = world[$internal];
  const traitCtx = trait2[$internal];
  const data = {
    generationId: ctx.entityMasks.length - 1,
    bitflag: ctx.bitflag,
    trait: trait2,
    store: traitCtx.createStore(),
    queries: /* @__PURE__ */ new Set(),
    trackingQueries: /* @__PURE__ */ new Set(),
    notQueries: /* @__PURE__ */ new Set(),
    relationQueries: /* @__PURE__ */ new Set(),
    schema: trait2.schema,
    changeSubscriptions: /* @__PURE__ */ new Set(),
    addSubscriptions: /* @__PURE__ */ new Set(),
    removeSubscriptions: /* @__PURE__ */ new Set()
  };
  const traitId_1_$f = trait2.id;
  if (traitId_1_$f >= ctx.traitInstances.length) {
    ctx.traitInstances.length = traitId_1_$f + 1;
  }
  ctx.traitInstances[traitId_1_$f] = data;
  world.traits.add(trait2);
  if (traitCtx.relation) ctx.relations.add(traitCtx.relation);
  const ctx_2_$f = world[$internal];
  ctx_2_$f.bitflag *= 2;
  if (ctx_2_$f.bitflag >= 2 ** 31) {
    ctx_2_$f.bitflag = 1;
    ctx_2_$f.entityMasks.push([]);
  }
  if ($orderedTargetsTrait in trait2) setupOrderedTraitSync(world, trait2);
}
function getOrderedTrait(world, entity, trait2) {
  const relation2 = trait2[$orderedTargetsTrait].relation;
  return new OrderedList(world, entity, relation2, trait2);
}
function addTrait(world, entity, ...traits) {
  for (let i = 0; i < traits.length; i++) {
    const config = traits[i];
    if (config?.[$relationPair]) {
      let result_addRelationPair_6_$f;
      const relation_6_$f = config.relation;
      const target_6_$f = config.target;
      if (typeof target_6_$f !== "number") {
        result_addRelationPair_6_$f = void 0;
      } else {
        const params_6_$f = config.params;
        const relationCtx_6_$f = relation_6_$f[$internal];
        const relationTrait_6_$f = relationCtx_6_$f.trait;
        let result_hasRelationToTarget_7_$f;
        const ctx_7_$f = world[$internal];
        const relationCtx_7_$f = relation_6_$f[$internal];
        const baseTrait_7_$f = relationCtx_7_$f.trait;
        const traitData_7_$f = ctx_7_$f.traitInstances[baseTrait_7_$f.id];
        if (!traitData_7_$f || !traitData_7_$f.relationTargets) {
          result_hasRelationToTarget_7_$f = false;
        } else {
          const eid_7_$f = entity & ENTITY_ID_MASK;
          if (relationCtx_7_$f.exclusive) {
            result_hasRelationToTarget_7_$f = traitData_7_$f.relationTargets[eid_7_$f] === target_6_$f;
          } else {
            const targets_7_$f = traitData_7_$f.relationTargets[eid_7_$f];
            result_hasRelationToTarget_7_$f = targets_7_$f ? targets_7_$f.includes(target_6_$f) : false;
          }
        }
        if (result_hasRelationToTarget_7_$f) {
          result_addRelationPair_6_$f = void 0;
        } else {
          if (relationCtx_6_$f.exclusive) {
            let result_getFirstRelationTarget_8_$f;
            const ctx_8_$f = world[$internal];
            const relationCtx_8_$f = relation_6_$f[$internal];
            const traitData_8_$f = ctx_8_$f.traitInstances[relationCtx_8_$f.trait.id];
            if (!traitData_8_$f || !traitData_8_$f.relationTargets) {
              result_getFirstRelationTarget_8_$f = void 0;
            } else {
              const eid_8_$f = entity & ENTITY_ID_MASK;
              if (relationCtx_8_$f.exclusive) {
                const target_8_$f = traitData_8_$f.relationTargets[eid_8_$f];
                result_getFirstRelationTarget_8_$f = target_8_$f;
              } else {
                const targets_8_$f = traitData_8_$f.relationTargets[eid_8_$f];
                result_getFirstRelationTarget_8_$f = targets_8_$f?.[0];
              }
            }
            const oldTarget_6_$f = result_getFirstRelationTarget_8_$f;
            if (oldTarget_6_$f !== void 0 && oldTarget_6_$f !== target_6_$f) {
              const instance_6_$f2 = world[$internal].traitInstances[relationTrait_6_$f.id];
              if (instance_6_$f2) {
                for (const sub_6_$f of instance_6_$f2.removeSubscriptions) sub_6_$f(entity, oldTarget_6_$f);
              }
              removeRelationTarget(world, relation_6_$f, entity, oldTarget_6_$f);
            }
          }
          let result_addTraitToEntity_10_$f;
          if (hasTrait(world, entity, relationTrait_6_$f)) {
            result_addTraitToEntity_10_$f = void 0;
          } else {
            const ctx_10_$f = world[$internal];
            const traitId_14_$f = relationTrait_6_$f.id;
            if (!(traitId_14_$f < ctx_10_$f.traitInstances.length && ctx_10_$f.traitInstances[traitId_14_$f] !== void 0)) {
              registerTrait(world, relationTrait_6_$f);
            }
            const instance_10_$f = ctx_10_$f.traitInstances[relationTrait_6_$f.id];
            const {
              generationId,
              bitflag,
              queries,
              trackingQueries
            } = instance_10_$f;
            const eid_10_$f = entity & ENTITY_ID_MASK;
            ctx_10_$f.entityMasks[generationId][eid_10_$f] |= bitflag;
            for (const dirtyMask_10_$f of ctx_10_$f.dirtyMasks.values()) {
              if (!dirtyMask_10_$f[generationId]) {
                dirtyMask_10_$f[generationId] = [];
              }
              dirtyMask_10_$f[generationId][eid_10_$f] |= bitflag;
            }
            for (const query_10_$f of queries) {
              query_10_$f.toRemove.remove(entity);
              const match_10_$f = query_10_$f.relationFilters && query_10_$f.relationFilters.length > 0 ? checkQueryWithRelations(world, query_10_$f, entity) : query_10_$f.check(world, entity);
              if (match_10_$f) {
                query_10_$f.add(entity);
              } else {
                query_10_$f.remove(world, entity);
              }
            }
            for (const query_10_$f of trackingQueries) {
              query_10_$f.toRemove.remove(entity);
              const match_10_$f = query_10_$f.relationFilters && query_10_$f.relationFilters.length > 0 ? checkQueryTrackingWithRelations(world, query_10_$f, entity, "add", generationId, bitflag) : query_10_$f.checkTracking(world, entity, "add", generationId, bitflag);
              if (match_10_$f) {
                query_10_$f.add(entity);
              } else {
                query_10_$f.remove(world, entity);
              }
            }
            ctx_10_$f.entityTraits.get(entity).add(relationTrait_6_$f);
            result_addTraitToEntity_10_$f = instance_10_$f;
          }
          let instance_6_$f = result_addTraitToEntity_10_$f;
          const targetIndex_6_$f = addRelationTarget(world, relation_6_$f, entity, target_6_$f);
          if (targetIndex_6_$f === -1) {
            result_addRelationPair_6_$f = void 0;
          } else {
            const schema_6_$f = instance_6_$f?.schema_6_$f ?? world[$internal].traitInstances[relationTrait_6_$f.id].schema;
            let result_getSchemaDefaults_12_$f;
            if (relationTrait_6_$f[$internal].type === "aos") {
              result_getSchemaDefaults_12_$f = typeof schema_6_$f === "function" ? schema_6_$f() : null;
            } else {
              if (!schema_6_$f || typeof schema_6_$f === "function" || Object.keys(schema_6_$f).length === 0) {
                result_getSchemaDefaults_12_$f = null;
              } else {
                const defaults_12_$f = {};
                for (const key_12_$f in schema_6_$f) {
                  if (typeof schema_6_$f[key_12_$f] === "function") {
                    defaults_12_$f[key_12_$f] = schema_6_$f[key_12_$f]();
                  } else {
                    defaults_12_$f[key_12_$f] = schema_6_$f[key_12_$f];
                  }
                }
                result_getSchemaDefaults_12_$f = defaults_12_$f;
              }
            }
            const defaults_6_$f = result_getSchemaDefaults_12_$f;
            if (defaults_6_$f) {
              setRelationDataAtIndex(world, entity, relation_6_$f, targetIndex_6_$f, {
                ...defaults_6_$f,
                ...params_6_$f
              });
            } else {
              if (params_6_$f) {
                setRelationDataAtIndex(world, entity, relation_6_$f, targetIndex_6_$f, params_6_$f);
              }
            }
            instance_6_$f = instance_6_$f ?? world[$internal].traitInstances[relationTrait_6_$f.id];
            for (const sub_6_$f of instance_6_$f.addSubscriptions) sub_6_$f(entity, target_6_$f);
          }
        }
      }
      result_addRelationPair_6_$f;
      continue;
    }
    let trait2;
    let params;
    if (Array.isArray(config)) {
      [trait2, params] = config;
    } else {
      trait2 = config;
    }
    let result_addTraitToEntity_17_$f;
    if (hasTrait(world, entity, trait2)) {
      result_addTraitToEntity_17_$f = void 0;
    } else {
      const ctx_17_$f = world[$internal];
      const traitId_20_$f = trait2.id;
      if (!(traitId_20_$f < ctx_17_$f.traitInstances.length && ctx_17_$f.traitInstances[traitId_20_$f] !== void 0)) {
        registerTrait(world, trait2);
      }
      const instance_17_$f = ctx_17_$f.traitInstances[trait2.id];
      const {
        generationId,
        bitflag,
        queries,
        trackingQueries
      } = instance_17_$f;
      const eid_17_$f = entity & ENTITY_ID_MASK;
      ctx_17_$f.entityMasks[generationId][eid_17_$f] |= bitflag;
      for (const dirtyMask_17_$f of ctx_17_$f.dirtyMasks.values()) {
        if (!dirtyMask_17_$f[generationId]) {
          dirtyMask_17_$f[generationId] = [];
        }
        dirtyMask_17_$f[generationId][eid_17_$f] |= bitflag;
      }
      for (const query_17_$f of queries) {
        query_17_$f.toRemove.remove(entity);
        const match_17_$f = query_17_$f.relationFilters && query_17_$f.relationFilters.length > 0 ? checkQueryWithRelations(world, query_17_$f, entity) : query_17_$f.check(world, entity);
        if (match_17_$f) {
          query_17_$f.add(entity);
        } else {
          query_17_$f.remove(world, entity);
        }
      }
      for (const query_17_$f of trackingQueries) {
        query_17_$f.toRemove.remove(entity);
        const match_17_$f = query_17_$f.relationFilters && query_17_$f.relationFilters.length > 0 ? checkQueryTrackingWithRelations(world, query_17_$f, entity, "add", generationId, bitflag) : query_17_$f.checkTracking(world, entity, "add", generationId, bitflag);
        if (match_17_$f) {
          query_17_$f.add(entity);
        } else {
          query_17_$f.remove(world, entity);
        }
      }
      ctx_17_$f.entityTraits.get(entity).add(trait2);
      result_addTraitToEntity_17_$f = instance_17_$f;
    }
    const data = result_addTraitToEntity_17_$f;
    if (!data) continue;
    const traitCtx = trait2[$internal];
    let result_getSchemaDefaults_19_$f;
    if (traitCtx.type === "aos") {
      result_getSchemaDefaults_19_$f = typeof data.schema === "function" ? data.schema() : null;
    } else {
      if (!data.schema || typeof data.schema === "function" || Object.keys(data.schema).length === 0) {
        result_getSchemaDefaults_19_$f = null;
      } else {
        const defaults_19_$f = {};
        for (const key_19_$f in data.schema) {
          if (typeof data.schema[key_19_$f] === "function") {
            defaults_19_$f[key_19_$f] = data.schema[key_19_$f]();
          } else {
            defaults_19_$f[key_19_$f] = data.schema[key_19_$f];
          }
        }
        result_getSchemaDefaults_19_$f = defaults_19_$f;
      }
    }
    const defaults = $orderedTargetsTrait in trait2 ? getOrderedTrait(world, entity, trait2) : result_getSchemaDefaults_19_$f;
    if (traitCtx.type === "aos") {
      setTrait(world, entity, trait2, params ?? defaults, false);
    } else if (defaults) {
      setTrait(world, entity, trait2, {
        ...defaults,
        ...params
      }, false);
    } else if (params) {
      setTrait(world, entity, trait2, params, false);
    }
    for (const sub of data.addSubscriptions) sub(entity);
  }
}
function removeTrait(world, entity, ...traits) {
  for (let i = 0; i < traits.length; i++) {
    const trait2 = traits[i];
    if (trait2?.[$relationPair]) {
      let result_removeRelationPair_34_$f;
      const relation_34_$f = trait2.relation;
      const target_34_$f = trait2.target;
      const relationTrait_34_$f = relation_34_$f[$internal].trait;
      if (!hasTrait(world, entity, relationTrait_34_$f)) {
        result_removeRelationPair_34_$f = void 0;
      } else {
        const instance_34_$f = world[$internal].traitInstances[relationTrait_34_$f.id];
        if (target_34_$f === "*") {
          if (instance_34_$f) {
            let result_getRelationTargets_36_$f;
            const ctx_36_$f = world[$internal];
            const relationCtx_36_$f = relation_34_$f[$internal];
            const traitData_36_$f = ctx_36_$f.traitInstances[relationCtx_36_$f.trait.id];
            if (!traitData_36_$f || !traitData_36_$f.relationTargets) {
              result_getRelationTargets_36_$f = [];
            } else {
              const eid_36_$f = entity & ENTITY_ID_MASK;
              if (relationCtx_36_$f.exclusive) {
                const target_36_$f = traitData_36_$f.relationTargets[eid_36_$f];
                result_getRelationTargets_36_$f = target_36_$f !== void 0 ? [target_36_$f] : [];
              } else {
                const targets_36_$f = traitData_36_$f.relationTargets[eid_36_$f];
                result_getRelationTargets_36_$f = targets_36_$f !== void 0 ? targets_36_$f.slice() : [];
              }
            }
            const targets_34_$f = result_getRelationTargets_36_$f;
            for (const t_34_$f of targets_34_$f) {
              for (const sub_34_$f of instance_34_$f.removeSubscriptions) sub_34_$f(entity, t_34_$f);
            }
          }
          removeAllRelationTargets(world, relation_34_$f, entity);
          removeTraitFromEntity(world, entity, relationTrait_34_$f);
          result_removeRelationPair_34_$f = void 0;
        } else {
          if (typeof target_34_$f === "number") {
            if (instance_34_$f) {
              for (const sub_34_$f of instance_34_$f.removeSubscriptions) sub_34_$f(entity, target_34_$f);
            }
            const {
              removedIndex,
              wasLastTarget
            } = removeRelationTarget(world, relation_34_$f, entity, target_34_$f);
            if (removedIndex === -1) {
              result_removeRelationPair_34_$f = void 0;
            } else {
              if (wasLastTarget) {
                removeTraitFromEntity(world, entity, relationTrait_34_$f);
              }
            }
          }
        }
      }
      result_removeRelationPair_34_$f;
      continue;
    }
    if (!hasTrait(world, entity, trait2)) continue;
    const traitCtx = trait2[$internal];
    if (traitCtx.relation) {
      const instance = world[$internal].traitInstances[trait2.id];
      if (instance) {
        let result_getRelationTargets_38_$f;
        const ctx_38_$f = world[$internal];
        const relationCtx_38_$f = traitCtx.relation[$internal];
        const traitData_38_$f = ctx_38_$f.traitInstances[relationCtx_38_$f.trait.id];
        if (!traitData_38_$f || !traitData_38_$f.relationTargets) {
          result_getRelationTargets_38_$f = [];
        } else {
          const eid_38_$f = entity & ENTITY_ID_MASK;
          if (relationCtx_38_$f.exclusive) {
            const target_38_$f = traitData_38_$f.relationTargets[eid_38_$f];
            result_getRelationTargets_38_$f = target_38_$f !== void 0 ? [target_38_$f] : [];
          } else {
            const targets_38_$f = traitData_38_$f.relationTargets[eid_38_$f];
            result_getRelationTargets_38_$f = targets_38_$f !== void 0 ? targets_38_$f.slice() : [];
          }
        }
        const targets = result_getRelationTargets_38_$f;
        for (const t of targets) {
          for (const sub of instance.removeSubscriptions) sub(entity, t);
        }
      }
      removeAllRelationTargets(world, traitCtx.relation, entity);
    } else {
      const instance = world[$internal].traitInstances[trait2.id];
      if (instance) {
        for (const sub of instance.removeSubscriptions) sub(entity);
      }
    }
    removeTraitFromEntity(world, entity, trait2);
  }
}
function cleanupRelationTarget(world, relation2, entity, target) {
  const relationTrait = relation2[$internal].trait;
  const instance = world[$internal].traitInstances[relationTrait.id];
  if (instance) {
    for (const sub of instance.removeSubscriptions) sub(entity, target);
  }
  const {
    removedIndex,
    wasLastTarget
  } = removeRelationTarget(world, relation2, entity, target);
  if (removedIndex === -1) return;
  if (wasLastTarget) removeTraitFromEntity(world, entity, relationTrait);
}
function hasTrait(world, entity, trait2) {
  const ctx = world[$internal];
  const instance = ctx.traitInstances[trait2.id];
  if (!instance) return false;
  const {
    generationId,
    bitflag
  } = instance;
  const eid = entity & ENTITY_ID_MASK;
  const mask = ctx.entityMasks[generationId][eid];
  return (mask & bitflag) === bitflag;
}
function setTrait(world, entity, trait2, value, triggerChanged = true) {
  if (trait2?.[$relationPair]) {
    const relation_47_$f = trait2.relation;
    const target_47_$f = trait2.target;
    if (typeof target_47_$f !== "number") {
      result_setTraitForPair_47_$f = void 0;
    } else {
      setRelationData(world, entity, relation_47_$f, target_47_$f, value);
      if (triggerChanged) {
        setPairChanged(world, entity, relation_47_$f[$internal].trait, target_47_$f);
      }
    }
    return void 0;
  }
  const ctx_48_$f = trait2[$internal];
  const ctx_49_$f = world[$internal];
  const instance_49_$f = ctx_49_$f.traitInstances[trait2.id];
  const store_48_$f = instance_49_$f.store;
  const index_48_$f = entity & ENTITY_ID_MASK;
  value instanceof Function && (value = value(ctx_48_$f.get(index_48_$f, store_48_$f)));
  ctx_48_$f.set(index_48_$f, store_48_$f, value);
  triggerChanged && setChanged(world, entity, trait2);
  return;
}
function getTrait(world, entity, trait2) {
  if (trait2?.[$relationPair]) {
    let result_getTraitForPair_52_$f;
    const relation_52_$f = trait2.relation;
    const target_52_$f = trait2.target;
    if (!hasRelationPair(world, entity, trait2)) {
      result_getTraitForPair_52_$f = void 0;
    } else {
      if (typeof target_52_$f !== "number") {
        result_getTraitForPair_52_$f = void 0;
      } else {
        result_getTraitForPair_52_$f = getRelationData(world, entity, relation_52_$f, target_52_$f);
      }
    }
    return result_getTraitForPair_52_$f;
  }
  let result_getTraitForTrait_53_$f;
  if (!hasTrait(world, entity, trait2)) {
    result_getTraitForTrait_53_$f = void 0;
  } else {
    const traitCtx_53_$f = trait2[$internal];
    const ctx_54_$f = world[$internal];
    const instance_54_$f = ctx_54_$f.traitInstances[trait2.id];
    const store_53_$f = instance_54_$f.store;
    const data_53_$f = traitCtx_53_$f.get(entity & ENTITY_ID_MASK, store_53_$f);
    result_getTraitForTrait_53_$f = data_53_$f;
  }
  return result_getTraitForTrait_53_$f;
}
function removeTraitFromEntity(world, entity, trait2) {
  if (!hasTrait(world, entity, trait2)) return;
  const ctx = world[$internal];
  const instance = ctx.traitInstances[trait2.id];
  const {
    generationId,
    bitflag,
    queries,
    trackingQueries
  } = instance;
  const eid = entity & ENTITY_ID_MASK;
  ctx.entityMasks[generationId][eid] &= ~bitflag;
  for (const dirtyMask of ctx.dirtyMasks.values()) {
    dirtyMask[generationId][eid] |= bitflag;
  }
  for (const query of queries) {
    const match = query.relationFilters && query.relationFilters.length > 0 ? checkQueryWithRelations(world, query, entity) : query.check(world, entity);
    if (match) query.add(entity);
    else query.remove(world, entity);
  }
  for (const query of trackingQueries) {
    const match = query.relationFilters && query.relationFilters.length > 0 ? checkQueryTrackingWithRelations(world, query, entity, "remove", generationId, bitflag) : query.checkTracking(world, entity, "remove", generationId, bitflag);
    if (match) query.add(entity);
    else query.remove(world, entity);
  }
  ctx.entityTraits.get(entity).delete(trait2);
}

// ../core/src/query/modifiers/changed.ts
function setChanged(world, entity, trait2) {
  let result_markChanged_4_$f;
  const ctx_4_$f = world[$internal];
  if (!hasTrait(world, entity, trait2)) {
    result_markChanged_4_$f = void 0;
  } else {
    const traitId_1_$f_4_$f = trait2.id;
    if (!(traitId_1_$f_4_$f < ctx_4_$f.traitInstances.length && ctx_4_$f.traitInstances[traitId_1_$f_4_$f] !== void 0)) {
      registerTrait(world, trait2);
    }
    const data_4_$f = ctx_4_$f.traitInstances[trait2.id];
    const eid_4_$f = entity & ENTITY_ID_MASK;
    const {
      generationId,
      bitflag
    } = data_4_$f;
    for (const changedMask_4_$f of ctx_4_$f.changedMasks.values()) {
      if (!changedMask_4_$f[generationId]) {
        changedMask_4_$f[generationId] = [];
      }
      if (!changedMask_4_$f[generationId][eid_4_$f]) {
        changedMask_4_$f[generationId][eid_4_$f] = 0;
      }
      changedMask_4_$f[generationId][eid_4_$f] |= bitflag;
    }
    for (const query_4_$f of data_4_$f.trackingQueries) {
      if (!query_4_$f.hasChangedModifiers) {
        continue;
      }
      if (!query_4_$f.changedTraits.has(trait2)) {
        continue;
      }
      const match_4_$f = query_4_$f.relationFilters && query_4_$f.relationFilters.length > 0 ? checkQueryTrackingWithRelations(world, query_4_$f, entity, "change", generationId, bitflag) : query_4_$f.checkTracking(world, entity, "change", generationId, bitflag);
      if (match_4_$f) {
        query_4_$f.add(entity);
      } else {
        query_4_$f.remove(world, entity);
      }
    }
    result_markChanged_4_$f = data_4_$f;
  }
  const data = result_markChanged_4_$f;
  if (!data) return;
  for (const sub of data.changeSubscriptions) sub(entity);
}
function setPairChanged(world, entity, trait2, target) {
  let result_markChanged_5_$f;
  const ctx_5_$f = world[$internal];
  if (!hasTrait(world, entity, trait2)) {
    result_markChanged_5_$f = void 0;
  } else {
    const traitId_1_$f_5_$f = trait2.id;
    if (!(traitId_1_$f_5_$f < ctx_5_$f.traitInstances.length && ctx_5_$f.traitInstances[traitId_1_$f_5_$f] !== void 0)) {
      registerTrait(world, trait2);
    }
    const data_5_$f = ctx_5_$f.traitInstances[trait2.id];
    const eid_5_$f = entity & ENTITY_ID_MASK;
    const {
      generationId,
      bitflag
    } = data_5_$f;
    for (const changedMask_5_$f of ctx_5_$f.changedMasks.values()) {
      if (!changedMask_5_$f[generationId]) {
        changedMask_5_$f[generationId] = [];
      }
      if (!changedMask_5_$f[generationId][eid_5_$f]) {
        changedMask_5_$f[generationId][eid_5_$f] = 0;
      }
      changedMask_5_$f[generationId][eid_5_$f] |= bitflag;
    }
    for (const query_5_$f of data_5_$f.trackingQueries) {
      if (!query_5_$f.hasChangedModifiers) {
        continue;
      }
      if (!query_5_$f.changedTraits.has(trait2)) {
        continue;
      }
      const match_5_$f = query_5_$f.relationFilters && query_5_$f.relationFilters.length > 0 ? checkQueryTrackingWithRelations(world, query_5_$f, entity, "change", generationId, bitflag) : query_5_$f.checkTracking(world, entity, "change", generationId, bitflag);
      if (match_5_$f) {
        query_5_$f.add(entity);
      } else {
        query_5_$f.remove(world, entity);
      }
    }
    result_markChanged_5_$f = data_5_$f;
  }
  const data = result_markChanged_5_$f;
  if (!data) return;
  for (const sub of data.changeSubscriptions) sub(entity, target);
}

// ../collections/src/hi-sparse-bitset.ts
var EMPTY_BLOCK = new Uint32Array(32);

// ../core/src/query/query-result.ts
var relationOnlyMethods = {
  readEach(callback) {
    for (let i = 0; i < this.length; i++) {
      callback([], this[i], i);
    }
    return this;
  },
  updateEach(callback) {
    for (let i = 0; i < this.length; i++) {
      callback([], this[i], i);
    }
    return this;
  },
  useStores(callback) {
    callback([], this);
    return this;
  },
  select() {
    return this;
  },
  sort(callback = (a, b) => (a & ENTITY_ID_MASK) - (b & ENTITY_ID_MASK)) {
    Array.prototype.sort.call(this, callback);
    return this;
  }
};
var cachedEmptyRelationResult = Object.assign([], relationOnlyMethods);

// ../core/src/query/utils/create-query-hash.ts
var MODIFIER_FACTOR = 1e5;
var RELATION_FACTOR = 1e7;
var RELATION_OFFSET = 5e6;
var RELATION_QUERY_OFFSET = 9e6;
var sortBuf = new Float64Array(1024);
var nextQueryId = 1;
var queryHashToId = /* @__PURE__ */ new Map();
function queryHashNumericId(hash) {
  let id = queryHashToId.get(hash);
  if (id === void 0) {
    id = nextQueryId++;
    queryHashToId.set(hash, id);
  }
  return id;
}
var createQueryHash = (parameters) => {
  let cursor = 0;
  for (let i = 0; i < parameters.length; i++) {
    const param = parameters[i];
    if (param?.[$relationPair]) {
      const relationId = param.relation[$internal].trait.id;
      if (param.targetQuery) {
        const subHash = param.targetQuery?.[$queryRef] ? param.targetQuery.hash : createQueryHash([...param.targetQuery]);
        sortBuf[cursor++] = relationId * RELATION_FACTOR + queryHashNumericId(subHash) + RELATION_QUERY_OFFSET;
        continue;
      }
      const target = param.target;
      const targetId = typeof target === "number" ? target : -1;
      sortBuf[cursor++] = relationId * RELATION_FACTOR + targetId + RELATION_OFFSET;
      continue;
    }
    if (param?.[$modifier]) {
      for (let j = 0; j < param.traitIds.length; j++) {
        sortBuf[cursor++] = param.id * MODIFIER_FACTOR + param.traitIds[j];
      }
      continue;
    }
    sortBuf[cursor++] = param.id;
  }
  const filled = sortBuf.subarray(0, cursor);
  filled.sort();
  return filled.join(",");
};

// ../core/src/query/query.ts
var IsExcluded = trait();
var queryId = 0;
function createQuery(...parameters) {
  const hash = createQueryHash(parameters);
  const existing = universe.cachedQueries.get(hash);
  if (existing) return existing;
  const id = queryId++;
  const queryRef = Object.freeze({
    [$queryRef]: true,
    id,
    hash,
    parameters
  });
  universe.cachedQueries.set(hash, queryRef);
  return queryRef;
}

// ../core/src/entity/utils/entity-index.ts
var releaseEntity = (index, entity) => {
  const id = entity & ENTITY_ID_MASK;
  const denseIndex = index.sparse[id];
  if (denseIndex === void 0 || denseIndex >= index.aliveCount) return;
  const lastIndex = index.aliveCount - 1;
  const lastEntity = index.dense[lastIndex];
  const lastId = lastEntity & ENTITY_ID_MASK;
  index.sparse[lastId] = denseIndex;
  index.dense[denseIndex] = lastEntity;
  index.sparse[id] = lastIndex;
  index.dense[lastIndex] = entity;
  index.aliveCount--;
};

// ../core/src/entity/entity-methods-patch.ts
Number.prototype.add = function(...traits) {
  const worldId_0_$f = this >>> WORLD_ID_SHIFT;
  return addTrait(universe.worlds[worldId_0_$f], this, ...traits);
};
Number.prototype.remove = function(...traits) {
  const worldId_1_$f = this >>> WORLD_ID_SHIFT;
  return removeTrait(universe.worlds[worldId_1_$f], this, ...traits);
};
Number.prototype.has = function(trait2) {
  const worldId_2_$f = this >>> WORLD_ID_SHIFT;
  const world = universe.worlds[worldId_2_$f];
  if (trait2?.[$relationPair]) return hasRelationPair(world, this, trait2);
  let result_hasTrait_4_$f;
  const ctx_4_$f = world[$internal];
  const instance_4_$f = ctx_4_$f.traitInstances[trait2.id];
  if (!instance_4_$f) {
    result_hasTrait_4_$f = false;
  } else {
    const {
      generationId,
      bitflag
    } = instance_4_$f;
    const eid_4_$f = this & ENTITY_ID_MASK;
    const mask_4_$f = ctx_4_$f.entityMasks[generationId][eid_4_$f];
    result_hasTrait_4_$f = (mask_4_$f & bitflag) === bitflag;
  }
  return result_hasTrait_4_$f;
};
Number.prototype.destroy = function() {
  const worldId_5_$f = this >>> WORLD_ID_SHIFT;
  return destroyEntity(universe.worlds[worldId_5_$f], this);
};
Number.prototype.changed = function(trait2) {
  const worldId_6_$f = this >>> WORLD_ID_SHIFT;
  return setChanged(universe.worlds[worldId_6_$f], this, trait2);
};
Number.prototype.get = function(trait2) {
  const worldId_7_$f = this >>> WORLD_ID_SHIFT;
  return getTrait(universe.worlds[worldId_7_$f], this, trait2);
};
Number.prototype.set = function(trait2, value, triggerChanged = true) {
  const worldId_8_$f = this >>> WORLD_ID_SHIFT;
  setTrait(universe.worlds[worldId_8_$f], this, trait2, value, triggerChanged);
};
Number.prototype.targetsFor = function(relation2) {
  let result_getRelationTargets_9_$f;
  const worldId_10_$f = this >>> WORLD_ID_SHIFT;
  const ctx_9_$f = universe.worlds[worldId_10_$f][$internal];
  const relationCtx_9_$f = relation2[$internal];
  const traitData_9_$f = ctx_9_$f.traitInstances[relationCtx_9_$f.trait.id];
  if (!traitData_9_$f || !traitData_9_$f.relationTargets) {
    result_getRelationTargets_9_$f = [];
  } else {
    const eid_9_$f = this & ENTITY_ID_MASK;
    if (relationCtx_9_$f.exclusive) {
      const target_9_$f = traitData_9_$f.relationTargets[eid_9_$f];
      result_getRelationTargets_9_$f = target_9_$f !== void 0 ? [target_9_$f] : [];
    } else {
      const targets_9_$f = traitData_9_$f.relationTargets[eid_9_$f];
      result_getRelationTargets_9_$f = targets_9_$f !== void 0 ? targets_9_$f.slice() : [];
    }
  }
  return result_getRelationTargets_9_$f;
};
Number.prototype.targetFor = function(relation2) {
  let result_getFirstRelationTarget_11_$f;
  const worldId_12_$f = this >>> WORLD_ID_SHIFT;
  const ctx_11_$f = universe.worlds[worldId_12_$f][$internal];
  const relationCtx_11_$f = relation2[$internal];
  const traitData_11_$f = ctx_11_$f.traitInstances[relationCtx_11_$f.trait.id];
  if (!traitData_11_$f || !traitData_11_$f.relationTargets) {
    result_getFirstRelationTarget_11_$f = void 0;
  } else {
    const eid_11_$f = this & ENTITY_ID_MASK;
    if (relationCtx_11_$f.exclusive) {
      const target_11_$f = traitData_11_$f.relationTargets[eid_11_$f];
      result_getFirstRelationTarget_11_$f = target_11_$f;
    } else {
      const targets_11_$f = traitData_11_$f.relationTargets[eid_11_$f];
      result_getFirstRelationTarget_11_$f = targets_11_$f?.[0];
    }
  }
  return result_getFirstRelationTarget_11_$f;
};
Number.prototype.id = function() {
  return this & ENTITY_ID_MASK;
};
Number.prototype.generation = function() {
  return this >>> GENERATION_SHIFT & GENERATION_MASK;
};
Number.prototype.isAlive = function() {
  const worldId_15_$f = this >>> WORLD_ID_SHIFT;
  const world = universe.worlds[worldId_15_$f];
  const entityIndex = world[$internal].entityIndex;
  let result_isEntityAlive_16_$f;
  const denseIndex_16_$f = entityIndex.sparse[this & ENTITY_ID_MASK];
  if (denseIndex_16_$f === void 0 || denseIndex_16_$f >= entityIndex.aliveCount) {
    result_isEntityAlive_16_$f = false;
  } else {
    const storedEntity_16_$f = entityIndex.dense[denseIndex_16_$f];
    result_isEntityAlive_16_$f = (this >>> GENERATION_SHIFT & GENERATION_MASK) === (storedEntity_16_$f >>> GENERATION_SHIFT & GENERATION_MASK) && this >>> WORLD_ID_SHIFT === entityIndex.worldId;
  }
  return result_isEntityAlive_16_$f;
};

// ../core/src/entity/entity.ts
var cachedSet = /* @__PURE__ */ new Set();
var cachedQueue = [];
function destroyEntity(world, entity) {
  const ctx = world[$internal];
  if (!world.has(entity)) throw new Error("Koota: The entity being destroyed does not exist.");
  const entityQueue = cachedQueue;
  const processedEntities = cachedSet;
  entityQueue.length = 0;
  entityQueue.push(entity);
  processedEntities.clear();
  while (entityQueue.length > 0) {
    const currentEntity = entityQueue.pop();
    if (processedEntities.has(currentEntity)) continue;
    processedEntities.add(currentEntity);
    for (const relation2 of ctx.relations) {
      const relationCtx = relation2[$internal];
      const sources = getEntitiesWithRelationTo(world, relation2, currentEntity);
      for (let si = sources.length - 1; si >= 0; si--) {
        const source = sources[si];
        if (!world.has(source)) continue;
        cleanupRelationTarget(world, relation2, source, currentEntity);
        if (relationCtx.autoDestroy === "source") entityQueue.push(source);
      }
      if (relationCtx.autoDestroy === "target") {
        let result_getRelationTargets_1_$f;
        const ctx_1_$f = world[$internal];
        const relationCtx_1_$f = relation2[$internal];
        const traitData_1_$f = ctx_1_$f.traitInstances[relationCtx_1_$f.trait.id];
        if (!traitData_1_$f || !traitData_1_$f.relationTargets) {
          result_getRelationTargets_1_$f = [];
        } else {
          const eid_1_$f = currentEntity & ENTITY_ID_MASK;
          if (relationCtx_1_$f.exclusive) {
            const target_1_$f = traitData_1_$f.relationTargets[eid_1_$f];
            result_getRelationTargets_1_$f = target_1_$f !== void 0 ? [target_1_$f] : [];
          } else {
            const targets_1_$f = traitData_1_$f.relationTargets[eid_1_$f];
            result_getRelationTargets_1_$f = targets_1_$f !== void 0 ? targets_1_$f.slice() : [];
          }
        }
        const targets = result_getRelationTargets_1_$f;
        for (const target of targets) {
          if (!world.has(target)) continue;
          if (!processedEntities.has(target)) entityQueue.push(target);
        }
      }
    }
    const entityTraits = ctx.entityTraits.get(currentEntity);
    if (entityTraits) {
      for (const trait2 of entityTraits) {
        removeTrait(world, currentEntity, trait2);
      }
    }
    releaseEntity(ctx.entityIndex, currentEntity);
    const allQuery = ctx.queriesHashMap.get("");
    if (allQuery) allQuery.remove(world, currentEntity);
    ctx.entityTraits.delete(currentEntity);
    const eid = currentEntity & ENTITY_ID_MASK;
    for (let i = 0; i < ctx.entityMasks.length; i++) {
      ctx.entityMasks[i][eid] = 0;
    }
  }
}

// ../react/src/hooks/use-query.ts
var import_react3 = require("react");
function useQuery(...parameters) {
  const world = useWorld();
  const [, forceUpdate] = (0, import_react3.useReducer)((x) => x + 1, 0);
  const queryRef = (0, import_react3.useMemo)(() => createQuery(...parameters), parameters);
  const cacheRef = (0, import_react3.useRef)(null);
  const getResult = () => {
    const query = world[$internal].queriesHashMap.get(queryRef.hash);
    if (query && cacheRef.current?.hash === queryRef.hash && cacheRef.current.version === query.version) {
      return cacheRef.current.result;
    }
    const result2 = world.query(queryRef).sort();
    const registeredQuery = world[$internal].queriesHashMap.get(queryRef.hash);
    cacheRef.current = {
      hash: queryRef.hash,
      version: registeredQuery.version,
      result: result2
    };
    return result2;
  };
  const result = getResult();
  (0, import_react3.useEffect)(() => {
    const update = () => forceUpdate();
    let unsubAdd = () => {
    };
    let unsubRemove = () => {
    };
    const subscribe = () => {
      unsubAdd = world.onQueryAdd(queryRef, update);
      unsubRemove = world.onQueryRemove(queryRef, update);
      const query = world[$internal].queriesHashMap.get(queryRef.hash);
      if (cacheRef.current && query.version !== cacheRef.current.version) {
        update();
      }
    };
    const handleReset = () => {
      cacheRef.current = null;
      unsubAdd();
      unsubRemove();
      subscribe();
      update();
    };
    subscribe();
    world[$internal].resetSubscriptions.add(handleReset);
    return () => {
      world[$internal].resetSubscriptions.delete(handleReset);
      unsubAdd();
      unsubRemove();
    };
  }, [world, queryRef]);
  return result;
}

// ../react/src/hooks/use-query-first.ts
function useQueryFirst(...parameters) {
  const query = useQuery(...parameters);
  return query[0];
}

// ../react/src/hooks/use-tag.ts
var import_react4 = require("react");

// ../react/src/utils/is-world.ts
function isWorld(target) {
  return typeof target?.spawn === "function";
}

// ../react/src/hooks/use-tag.ts
function useTag(target, tag) {
  const contextWorld = useWorld();
  const [, forceUpdate] = (0, import_react4.useReducer)((x) => x + 1, 0);
  const memo = (0, import_react4.useMemo)(() => target ? createSubscriptions(target, tag, contextWorld) : void 0, [target, tag, contextWorld]);
  const valueRef = (0, import_react4.useRef)(false);
  const memoRef = (0, import_react4.useRef)(memo);
  if (memoRef.current !== memo) {
    memoRef.current = memo;
    valueRef.current = memo?.entity.has(tag) ?? false;
  }
  (0, import_react4.useEffect)(() => {
    if (!memo) {
      valueRef.current = false;
      forceUpdate();
      return;
    }
    const unsubscribe = memo.subscribe((value) => {
      valueRef.current = value;
      forceUpdate();
    });
    return () => unsubscribe();
  }, [memo]);
  return valueRef.current;
}
function createSubscriptions(target, tag, contextWorld) {
  const world = isWorld(target) ? target : contextWorld;
  const entity = isWorld(target) ? target[$internal].worldEntity : target;
  return {
    entity,
    subscribe: (setValue) => {
      const onAddUnsub = world.onAdd(tag, (e) => {
        if (e === entity) setValue(true);
      });
      const onRemoveUnsub = world.onRemove(tag, (e) => {
        if (e === entity) setValue(false);
      });
      setValue(entity.has(tag));
      return () => {
        onAddUnsub();
        onRemoveUnsub();
      };
    }
  };
}

// ../react/src/hooks/use-has.ts
var import_react6 = require("react");

// ../react/src/utils/use-stable-pair.ts
var import_react5 = require("react");
function useStableTrait(input) {
  const relation2 = input?.[$relationPair] ? input.relation : input;
  const pairTarget = input?.[$relationPair] ? input.target : void 0;
  return (0, import_react5.useMemo)(() => input, [relation2, pairTarget]);
}

// ../react/src/hooks/use-has.ts
function useHas(target, trait2) {
  const contextWorld = useWorld();
  const [, forceUpdate] = (0, import_react6.useReducer)((x) => x + 1, 0);
  const stableTrait = useStableTrait(trait2);
  const memo = (0, import_react6.useMemo)(() => target ? createSubscriptions2(target, stableTrait, contextWorld) : void 0, [target, stableTrait, contextWorld]);
  const valueRef = (0, import_react6.useRef)(false);
  const memoRef = (0, import_react6.useRef)(memo);
  if (memoRef.current !== memo) {
    memoRef.current = memo;
    valueRef.current = memo?.entity.has(stableTrait) ?? false;
  }
  (0, import_react6.useEffect)(() => {
    if (!memo) {
      valueRef.current = false;
      forceUpdate();
      return;
    }
    const unsubscribe = memo.subscribe((value) => {
      valueRef.current = value;
      forceUpdate();
    });
    return () => unsubscribe();
  }, [memo]);
  return valueRef.current;
}
function createSubscriptions2(target, trait2, contextWorld) {
  const world = isWorld(target) ? target : contextWorld;
  const entity = isWorld(target) ? target[$internal].worldEntity : target;
  const isWildcard = !!trait2?.[$relationPair] && trait2.target === "*";
  const wildcardRelation = isWildcard ? trait2.relation : void 0;
  return {
    entity,
    subscribe: (setValue) => {
      const onAddUnsub = world.onAdd(trait2, (e) => {
        if (e === entity) setValue(true);
      });
      const onRemoveUnsub = world.onRemove(trait2, (e) => {
        if (e !== entity) return;
        if (wildcardRelation) {
          setValue(entity.targetsFor(wildcardRelation).length > 1);
        } else {
          setValue(false);
        }
      });
      setValue(entity.has(trait2));
      return () => {
        onAddUnsub();
        onRemoveUnsub();
      };
    }
  };
}

// ../react/src/hooks/use-target.ts
var import_react7 = require("react");
function useTarget(target, relation2) {
  const contextWorld = useWorld();
  const [, forceUpdate] = (0, import_react7.useReducer)((x) => x + 1, 0);
  const memo = (0, import_react7.useMemo)(() => target ? createSubscriptions3(target, relation2, contextWorld) : void 0, [target, relation2, contextWorld]);
  const valueRef = (0, import_react7.useRef)(void 0);
  const memoRef = (0, import_react7.useRef)(memo);
  if (memoRef.current !== memo) {
    memoRef.current = memo;
    valueRef.current = memo?.entity.targetFor(relation2);
  }
  (0, import_react7.useEffect)(() => {
    if (!memo) {
      valueRef.current = void 0;
      forceUpdate();
      return;
    }
    const unsubscribe = memo.subscribe((value) => {
      valueRef.current = value;
      forceUpdate();
    });
    return () => unsubscribe();
  }, [memo]);
  return valueRef.current;
}
function createSubscriptions3(target, relation2, contextWorld) {
  const world = isWorld(target) ? target : contextWorld;
  const entity = isWorld(target) ? target[$internal].worldEntity : target;
  return {
    entity,
    subscribe: (setValue) => {
      const onAddUnsub = world.onAdd(relation2, (e) => {
        if (e === entity) setValue(entity.targetFor(relation2));
      });
      const onRemoveUnsub = world.onRemove(relation2, (e) => {
        if (e === entity) setValue(void 0);
      });
      const onChangeUnsub = world.onChange(relation2, (e) => {
        if (e === entity) setValue(entity.targetFor(relation2));
      });
      setValue(entity.targetFor(relation2));
      return () => {
        onAddUnsub();
        onRemoveUnsub();
        onChangeUnsub();
      };
    }
  };
}

// ../react/src/hooks/use-targets.ts
var import_react8 = require("react");
function useTargets(target, relation2) {
  const contextWorld = useWorld();
  const [, forceUpdate] = (0, import_react8.useReducer)((x) => x + 1, 0);
  const memo = (0, import_react8.useMemo)(() => target ? createSubscriptions4(target, relation2, contextWorld) : void 0, [target, relation2, contextWorld]);
  const valueRef = (0, import_react8.useRef)([]);
  const memoRef = (0, import_react8.useRef)(memo);
  if (memoRef.current !== memo) {
    memoRef.current = memo;
    valueRef.current = memo?.entity.targetsFor(relation2) ?? [];
  }
  (0, import_react8.useEffect)(() => {
    if (!memo) {
      valueRef.current = [];
      forceUpdate();
      return;
    }
    const unsubscribe = memo.subscribe((value) => {
      valueRef.current = value;
      forceUpdate();
    });
    return () => unsubscribe();
  }, [memo]);
  return valueRef.current;
}
function createSubscriptions4(target, relation2, contextWorld) {
  const world = isWorld(target) ? target : contextWorld;
  const entity = isWorld(target) ? target[$internal].worldEntity : target;
  return {
    entity,
    subscribe: (setValue) => {
      let currentValue = [];
      const update = (value) => {
        currentValue = value;
        setValue(value);
      };
      const onAddUnsub = world.onAdd(relation2, (e) => {
        if (e === entity) update(entity.targetsFor(relation2));
      });
      const onRemoveUnsub = world.onRemove(relation2, (e, t) => {
        if (e === entity) update(currentValue.filter((p) => p !== t));
      });
      const onChangeUnsub = world.onChange(relation2, (e) => {
        if (e === entity) update(entity.targetsFor(relation2));
      });
      update(entity.targetsFor(relation2));
      return () => {
        onAddUnsub();
        onRemoveUnsub();
        onChangeUnsub();
      };
    }
  };
}

// ../react/src/hooks/use-trait.ts
var import_react9 = require("react");
function useTrait(target, trait2) {
  const contextWorld = useWorld();
  const [, forceUpdate] = (0, import_react9.useReducer)((x) => x + 1, 0);
  const valueRef = (0, import_react9.useRef)(void 0);
  const memoRef = (0, import_react9.useRef)(void 0);
  const stableTrait = useStableTrait(trait2);
  const memo = (0, import_react9.useMemo)(() => target ? createSubscriptions5(target, stableTrait, contextWorld) : void 0, [target, stableTrait, contextWorld]);
  if (memoRef.current !== memo) {
    memoRef.current = memo;
    valueRef.current = memo?.entity.has(stableTrait) ? memo.entity.get(stableTrait) : void 0;
  }
  (0, import_react9.useEffect)(() => {
    if (!memo) return;
    let initialized = false;
    const unsub = memo.subscribe((value) => {
      if (!initialized) {
        initialized = true;
        if (shallowEqual(value, valueRef.current)) return;
      }
      valueRef.current = value;
      forceUpdate();
    });
    return () => unsub();
  }, [memo]);
  return valueRef.current;
}
function createSubscriptions5(target, trait2, contextWorld) {
  const world = isWorld(target) ? target : contextWorld;
  const entity = isWorld(target) ? target[$internal].worldEntity : target;
  return {
    entity,
    subscribe: (setValue) => {
      const onChangeUnsub = world.onChange(trait2, (e) => {
        if (e === entity) setValue(e.get(trait2));
      });
      const onAddUnsub = world.onAdd(trait2, (e) => {
        if (e === entity) setValue(e.get(trait2));
      });
      const onRemoveUnsub = world.onRemove(trait2, (e) => {
        if (e === entity) setValue(void 0);
      });
      setValue(entity.has(trait2) ? entity.get(trait2) : void 0);
      return () => {
        onChangeUnsub();
        onAddUnsub();
        onRemoveUnsub();
      };
    }
  };
}

// ../react/src/hooks/use-trait-effect.ts
var import_react10 = require("react");
function useTraitEffect(target, trait2, callback) {
  const contextWorld = useWorld();
  const world = (0, import_react10.useMemo)(() => isWorld(target) ? target : contextWorld, [target, contextWorld]);
  const entity = (0, import_react10.useMemo)(() => isWorld(target) ? target[$internal].worldEntity : target, [target]);
  const stableTrait = useStableTrait(trait2);
  const callbackRef = (0, import_react10.useRef)(callback);
  callbackRef.current = callback;
  (0, import_react10.useEffect)(() => {
    const onChangeUnsub = world.onChange(stableTrait, (e) => {
      if (e === entity) callbackRef.current(e.get(stableTrait));
    });
    const onAddUnsub = world.onAdd(stableTrait, (e) => {
      if (e === entity) callbackRef.current(e.get(stableTrait));
    });
    const onRemoveUnsub = world.onRemove(stableTrait, (e) => {
      if (e === entity) callbackRef.current(void 0);
    });
    callbackRef.current(entity.has(stableTrait) ? entity.get(stableTrait) : void 0);
    return () => {
      onChangeUnsub();
      onAddUnsub();
      onRemoveUnsub();
    };
  }, [stableTrait, world, entity]);
}

// ../react/src/world/world-provider.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function WorldProvider({
  children,
  world
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WorldContext.Provider, { value: world, children });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  WorldProvider,
  useActions,
  useHas,
  useQuery,
  useQueryFirst,
  useTag,
  useTarget,
  useTargets,
  useTrait,
  useTraitEffect,
  useWorld
});
