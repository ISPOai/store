declare const $internal: unique symbol;

declare class SparseSet {
    _dense: number[];
    _sparse: number[];
    _cursor: number;
    _denseRaw: {
        array: number[];
        length: number;
    };
    has(val: number): boolean;
    add(val: number): void;
    remove(val: number): void;
    clear(): void;
    sort(): void;
    getIndex(val: number): number;
    get dense(): number[];
    get denseRaw(): {
        array: number[];
        length: number;
    };
    get rawDense(): readonly number[];
    get length(): number;
    get sparse(): number[];
}

/**
 * Storage type for trait data.
 * - AoS: Array of instances, one per entity
 * - SoA: Object with arrays, one array per property
 */
type Store<T extends Schema = any> = T extends AoSFactory ? ReturnType<T>[] : {
    [P in keyof T]: T[P] extends (...args: never[]) => unknown ? ReturnType<T[P]>[] : T[P][];
};
/**
 * Storage layout type.
 * - 'soa': Struct of Arrays - properties stored in separate arrays
 * - 'aos': Array of Structs - instances stored directly
 * - 'tag': No data storage - empty schema marker
 */
type StoreType = 'aos' | 'soa' | 'tag';
/**
 * Schema definition for traits.
 * Can be a SoA object schema, an AoS factory function, or an empty object (tag).
 */
type Schema = {
    [key: string]: number | bigint | string | boolean | null | undefined | (() => unknown);
} | AoSFactory | Record<string, never>;
/**
 * Factory function for AoS (Array of Structs) storage.
 * Returns a single instance that will be stored per entity.
 */
type AoSFactory = () => unknown;
/**
 * Normalizes schema types to their primitive forms.
 * Ensures that explicit values like true, false or "string literal" are
 * normalized to their primitive types (boolean, string, etc).
 */
type Norm<T extends Schema> = T extends Record<string, never> ? T : T extends AoSFactory ? () => ReturnType<T> extends number ? number : ReturnType<T> extends boolean ? boolean : ReturnType<T> extends string ? string : ReturnType<T> : {
    [K in keyof T]: T[K] extends object ? T[K] extends (...args: never[]) => unknown ? T[K] : never : T[K] extends boolean ? boolean : T[K];
}[keyof T] extends never ? never : {
    [K in keyof T]: T[K] extends boolean ? boolean : T[K];
};

declare const $modifier: unique symbol;

declare const $parameters: unique symbol;
declare const $queryRef: unique symbol;

type QueryModifier = (...components: Trait[]) => Modifier;
type QueryParameter = Trait | RelationPair | ReturnType<QueryModifier>;
type QuerySubscriber = (entity: Entity) => void;
type QueryUnsubscriber = () => void;
type QueryResultOptions = {
    changeDetection?: 'always' | 'auto' | 'never';
};
type QueryResult<T extends QueryParameter[] = QueryParameter[]> = readonly Entity[] & {
    readEach: (callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void) => QueryResult<T>;
    updateEach: (callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void, options?: QueryResultOptions) => QueryResult<T>;
    useStores: (callback: (stores: StoresFromParameters<T>, entities: readonly Entity[]) => void) => QueryResult<T>;
    select<U extends QueryParameter[]>(...params: U): QueryResult<U>;
    sort(callback?: (a: Entity, b: Entity) => number): QueryResult<T>;
};
type UnwrapModifierData<T> = T extends Modifier<infer C> ? C : never;
type StoresFromParameters<T extends QueryParameter[]> = T extends [infer First, ...infer Rest] ? [
    ...(First extends Trait ? [ExtractStore<First>] : First extends Modifier ? StoresFromParameters<UnwrapModifierData<First>> : []),
    ...(Rest extends QueryParameter[] ? StoresFromParameters<Rest> : [])
] : [];
type InstancesFromParameters<T extends QueryParameter[]> = T extends [
    infer First,
    ...infer Rest
] ? [
    ...(First extends Trait ? IsTag<First> extends false ? ExtractSchema<First> extends AoSFactory ? [ReturnType<ExtractSchema<First>>] : [TraitRecord<First>] : [] : First extends Modifier ? IsNotModifier<First> extends true ? [] : InstancesFromParameters<UnwrapModifierData<First>> : []),
    ...(Rest extends QueryParameter[] ? InstancesFromParameters<Rest> : [])
] : [];
type IsNotModifier<T> = T extends Modifier<Trait[], infer TType> ? (TType extends 'not' ? true : false) : false;
type QueryHash = string;
type Query<T extends QueryParameter[] = QueryParameter[]> = {
    readonly [$queryRef]: true;
    /** Public read-only ID for fast array lookups */
    readonly id: number;
    /** Hash string for deduplication */
    readonly hash: QueryHash;
    /** Query parameters for creating instances */
    readonly parameters: T;
    readonly [$parameters]: T;
};
type ResolvedRelationFilter = RelationPair & {
    targetQueryRef?: Query<QueryParameter[]>;
    targetQueryMatches?: SparseSet;
};
type Modifier<TTrait extends Trait[] = Trait[], TType extends string = string> = {
    [$modifier]: true;
    type: TType;
    id: number;
    traits: TTrait;
    traitIds: number[];
};
/** Parameter types that can be passed to Or modifier */
type OrParameter = Trait | Modifier;
/** Or modifier that can contain both traits and nested modifiers */
type OrModifier<T extends OrParameter[] = OrParameter[]> = Modifier<ExtractTraitsFromOrParams<T>, 'or'> & {
    modifiers: Modifier[];
};
/** Extract traits from Or parameters (filters out modifiers) */
type ExtractTraitsFromOrParams<T extends OrParameter[]> = T extends [infer First, ...infer Rest] ? First extends Trait ? Rest extends OrParameter[] ? [First, ...ExtractTraitsFromOrParams<Rest>] : [First] : Rest extends OrParameter[] ? ExtractTraitsFromOrParams<Rest> : [] : [];
/**
 * Unified tracking group that supports both AND and OR logic.
 * Replaces the old separate tracking arrays and OrTrackingGroup.
 */
type TrackingGroup = {
    /** Whether all traits must match (and) or any trait can match (or) */
    logic: 'and' | 'or';
    /** The type of tracking event */
    type: 'add' | 'remove' | 'change';
    /** Tracking modifier ID for snapshot/mask lookups */
    id: number;
    /** Bitmasks indexed by generationId */
    bitmasks: (number | undefined)[];
    /** Per-entity tracker state indexed by [generationId][entityId] */
    trackers: (number[] | undefined)[];
};
type QueryInstance<T extends QueryParameter[] = QueryParameter[]> = {
    version: number;
    world: World;
    parameters: T;
    hash: QueryHash;
    traits: Trait[];
    /** Static trait instances for non-tracking query matching */
    traitInstances: {
        required: TraitInstance[];
        forbidden: TraitInstance[];
        or: TraitInstance[];
        all: TraitInstance[];
    };
    /** Static bitmasks for non-tracking query matching (indexed by generationId) */
    staticBitmasks: {
        required: number;
        forbidden: number;
        or: number;
    }[];
    /** Unified tracking groups with explicit AND/OR logic */
    trackingGroups: TrackingGroup[];
    generations: number[];
    entities: SparseSet;
    isTracking: boolean;
    hasChangedModifiers: boolean;
    changedTraits: Set<Trait>;
    toRemove: SparseSet;
    cleanup: QueryUnsubscriber[];
    addSubscriptions: Set<QuerySubscriber>;
    removeSubscriptions: Set<QuerySubscriber>;
    /** Relation pairs for target-specific queries */
    relationFilters?: ResolvedRelationFilter[];
    run: (world: World, params: QueryParameter[]) => QueryResult<T>;
    add: (entity: Entity) => void;
    remove: (world: World, entity: Entity) => void;
    check: (world: World, entity: Entity) => boolean;
    checkTracking: (world: World, entity: Entity, eventType: 'add' | 'remove' | 'change', generationId: number, bitflag: number) => boolean;
    resetTrackingBitmasks: (eid: number) => void;
};
type EventType = 'add' | 'remove' | 'change';

/**
 * An ordered list of entities that syncs with a relation.
 * Extends Array to provide native array methods while keeping relation pairs in sync.
 *
 * @experimental This API is experimental and may change in future versions.
 * Please provide feedback on GitHub or Discord.
 */
declare class OrderedList extends Array<Entity> {
    private world;
    private parent;
    private relation;
    private orderedTrait;
    private _syncing;
    constructor(world: World, parent: Entity, relation: Relation, orderedTrait: Trait, items?: Entity[]);
    get [Symbol.toStringTag](): string;
    /**
     * Add entities to the end of the list and add relation pairs.
     */
    push(...items: Entity[]): number;
    /**
     * Remove and return the last entity, removing its relation pair.
     */
    pop(): Entity | undefined;
    /**
     * Remove and return the first entity, removing its relation pair.
     */
    shift(): Entity | undefined;
    /**
     * Add entities to the beginning of the list and add relation pairs.
     */
    unshift(...items: Entity[]): number;
    /**
     * Remove and/or insert entities, syncing relation pairs.
     */
    splice(start: number, deleteCount?: number, ...items: Entity[]): Entity[];
    /**
     * Sort the list in place. Does not modify relations.
     */
    sort(compareFn?: (a: Entity, b: Entity) => number): this;
    /**
     * Reverse the list in place. Does not modify relations.
     */
    reverse(): this;
    /**
     * Override map to return a plain array instead of OrderedList.
     */
    map<U>(callbackfn: (value: Entity, index: number, array: Entity[]) => U): U[];
    /**
     * Override filter to return a plain array instead of OrderedList.
     */
    filter(predicate: (value: Entity, index: number, array: Entity[]) => boolean): Entity[];
    /**
     * Override slice to return a plain array instead of OrderedList.
     */
    slice(start?: number, end?: number): Entity[];
    /**
     * Move an entity to a specific index in the list.
     * Does not modify the relation, only reorders.
     */
    moveTo(item: Entity, toIndex: number): void;
    /**
     * Insert an entity at a specific index and add its relation pair.
     */
    insert(item: Entity, index: number): void;
    /**
     * Internal method to append without triggering relation add.
     * Used by the sync system when a relation is added externally.
     */
    _appendWithoutSync(item: Entity): void;
    /**
     * Internal method to remove without triggering relation remove.
     * Used by the sync system when a relation is removed externally.
     */
    _removeWithoutSync(item: Entity): void;
}

declare const $relationPair: unique symbol;
declare const $relation: unique symbol;
declare const $orderedTargetsTrait: unique symbol;

type RelationTarget = Entity | '*';
type RelationInputTarget = RelationTarget | Query<QueryParameter[]> | readonly QueryParameter[];
interface ConcreteRelationPair<T extends Trait = Trait> {
    readonly [$relationPair]: true;
    readonly relation: Relation<T>;
    readonly target: RelationTarget;
    readonly targetQuery?: undefined;
    readonly params?: Record<string, unknown>;
}
interface QueryRelationPair<T extends Trait = Trait> {
    readonly [$relationPair]: true;
    readonly relation: Relation<T>;
    readonly target?: undefined;
    readonly targetQuery: Query<QueryParameter[]> | readonly QueryParameter[];
    readonly params?: undefined;
}
/** A pair represents a relation + target combination */
type RelationPair<T extends Trait = Trait> = ConcreteRelationPair<T> | QueryRelationPair<T>;
type RelationCall<T extends Trait = Trait> = {
    (target: RelationTarget, params?: Record<string, unknown>): ConcreteRelationPair<T>;
    (targetQuery: Query<QueryParameter[]>): QueryRelationPair<T>;
    (...targetQuery: [QueryParameter, ...QueryParameter[]]): QueryRelationPair<T>;
};
type Relation<T extends Trait = Trait> = {
    readonly [$relation]: true;
    [$internal]: {
        trait: T;
        exclusive: boolean;
        autoDestroy: 'source' | 'target' | false;
    };
} & RelationCall<T>;
interface OrderedRelation<T extends Trait = Trait> extends Trait<() => OrderedList> {
    [$orderedTargetsTrait]: {
        relation: Relation<T>;
    };
}

type Entity = number & {
    add: (...traits: ConfigurableTrait[]) => void;
    remove: (...traits: (Trait | RelationPair)[]) => void;
    has: (trait: Trait | RelationPair) => boolean;
    destroy: () => void;
    changed: (trait: Trait) => void;
    set: <T extends Trait | RelationPair>(trait: T, value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>, flagChanged?: boolean) => void;
    get: <T extends Trait | RelationPair>(trait: T) => TraitRecord<ExtractSchema<T>> | undefined;
    targetFor: <T extends Trait>(relation: Relation<T>) => Entity | undefined;
    targetsFor: <T extends Trait>(relation: Relation<T>) => Entity[];
    id: () => number;
    generation: () => number;
    isAlive: () => boolean;
};

type TraitType = StoreType;
type TraitValue<TSchema extends Schema> = TSchema extends AoSFactory ? ReturnType<TSchema> : Partial<TraitRecord<TSchema>>;
type Trait<TSchema extends Schema = any> = {
    /** Public read-only ID for fast array lookups */
    readonly id: number;
    readonly schema: TSchema;
    [$internal]: {
        set: (index: number, store: any, value: TraitValue<TSchema>) => void;
        fastSet: (index: number, store: any, value: TraitValue<TSchema>) => boolean;
        fastSetWithChangeDetection: (index: number, store: any, value: TraitValue<TSchema>) => boolean;
        get: (index: number, store: any) => TraitRecord<TSchema>;
        id: number;
        createStore: () => Store<TSchema>;
        /** Reference to parent relation if this trait is owned by a relation */
        relation: Relation<any> | null;
        type: StoreType;
    };
} & ((params?: TraitValue<TSchema>) => [Trait<TSchema>, TraitValue<TSchema>]);
type TagTrait = Trait<Record<string, never>> & {
    [$internal]: {
        type: 'tag';
    };
};
type TraitTuple<T extends Trait = Trait> = [
    T,
    T extends Trait<infer S> ? S extends AoSFactory ? ReturnType<S> : Partial<TraitRecord<S>> : never
];
type ConfigurableTrait<T extends Trait = Trait> = T | TraitTuple<T> | RelationPair<T>;
type SetTraitCallback<T extends Trait | RelationPair> = (prev: TraitRecord<ExtractSchema<T>>) => TraitValue<ExtractSchema<T>>;
type TraitRecordFromSchema<T extends Schema> = T extends AoSFactory ? ReturnType<T> : {
    [P in keyof T]: T[P] extends (...args: never[]) => unknown ? ReturnType<T[P]> : T[P];
};
/**
 * The record of a trait.
 * For SoA it is a snapshot of the state for a single entity.
 * For AoS it is the state instance for a single entity.
 */
type TraitRecord<T extends Trait | Schema> = T extends Trait ? TraitRecordFromSchema<T['schema']> : TraitRecordFromSchema<T>;
type ExtractSchema<T extends Trait | Relation<Trait> | RelationPair> = T extends RelationPair<infer R> ? ExtractSchema<R> : T extends Relation<infer R> ? ExtractSchema<R> : T extends Trait<infer S> ? S : never;
type ExtractStore<T extends Trait> = T extends {
    [$internal]: {
        createStore(): infer Store;
    };
} ? Store : never;
type ExtractIsTag<T extends Trait> = T extends {
    [$internal]: {
        type: 'tag';
    };
} ? true : false;
type IsTag<T extends Trait> = ExtractIsTag<T>;
interface TraitInstance<T extends Trait = Trait, S extends Schema = ExtractSchema<T>> {
    generationId: number;
    bitflag: number;
    trait: Trait;
    store: Store<S>;
    /** Non-tracking queries that include this trait */
    queries: Set<QueryInstance>;
    /** Tracking queries (Added/Removed/Changed) that include this trait */
    trackingQueries: Set<QueryInstance>;
    notQueries: Set<QueryInstance>;
    /** Queries that filter by this relation (only for relation traits) */
    relationQueries: Set<QueryInstance>;
    schema: S;
    changeSubscriptions: Set<(entity: Entity, target?: Entity) => void>;
    addSubscriptions: Set<(entity: Entity, target?: Entity) => void>;
    removeSubscriptions: Set<(entity: Entity, target?: Entity) => void>;
    /**
     * Only for relation traits.
     * For exclusive: relationTargets[eid] = targetId (number)
     * For non-exclusive: relationTargets[eid] = [targetId1, targetId2, ...] (number[])
     */
    relationTargets?: number[] | number[][];
    /** Reverse index: target entity ID → source entities pointing at it. */
    relationSourcesByTarget?: Entity[][];
}
type TraitOrRelation = Trait | Relation<Trait>;
/** Extracts the underlying Trait from a TraitOrRelation (Relations contain a Trait) */
type ExtractTrait<T> = T extends Relation<infer TTrait> ? TTrait : T;
/** Maps a tuple of TraitOrRelation to their underlying Traits */
type ExtractTraits<T extends TraitOrRelation[]> = {
    [K in keyof T]: ExtractTrait<T[K]>;
};

type EntityIndex = {
    /** The number of currently alive entities. */
    aliveCount: number;
    /** Array of packed entities, densely packed. */
    dense: Entity[];
    /** Sparse array mapping entity IDs to their index in the dense array. */
    sparse: number[];
    /** The highest entity ID that has been assigned. */
    maxId: number;
    /** The current world ID. */
    worldId: number;
};
/**
 * Creates and initializes a new EntityIndex.
 * @param worldId - The ID of the world this index belongs to.
 * @returns A new EntityIndex object.
 */
declare const createEntityIndex: (worldId: number) => EntityIndex;

type WorldOptions = {
    traits?: ConfigurableTrait[];
    lazy?: boolean;
};
type WorldInternal = {
    entityIndex: ReturnType<typeof createEntityIndex>;
    entityMasks: number[][];
    entityTraits: Map<number, Set<Trait>>;
    bitflag: number;
    traitInstances: (TraitInstance | undefined)[];
    relations: Set<Relation<Trait>>;
    queriesHashMap: Map<string, QueryInstance>;
    queryInstances: (QueryInstance | undefined)[];
    actionInstances: (ActionInstance | undefined)[];
    notQueries: Set<QueryInstance>;
    dirtyQueries: Set<QueryInstance>;
    dirtyMasks: Map<number, number[][]>;
    trackingSnapshots: Map<number, number[][]>;
    changedMasks: Map<number, number[][]>;
    worldEntity: Entity;
    trackedTraits: Set<Trait>;
    resetSubscriptions: Set<(world: World) => void>;
};
type World = {
    readonly id: number;
    readonly isInitialized: boolean;
    readonly entities: Entity[];
    readonly traits: Set<Trait>;
    [$internal]: WorldInternal;
    init(...traits: ConfigurableTrait[]): void;
    spawn(...traits: ConfigurableTrait[]): Entity;
    has(entity: Entity): boolean;
    has(trait: Trait): boolean;
    has(target: Entity | Trait): boolean;
    add(...traits: ConfigurableTrait[]): void;
    remove(...traits: Trait[]): void;
    get<T extends Trait>(trait: T): TraitRecord<ExtractSchema<T>> | undefined;
    set<T extends Trait>(trait: T, value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>): void;
    destroy(): void;
    reset(): void;
    query<T extends QueryParameter[]>(key: Query<T>): QueryResult<T>;
    query<T extends QueryParameter[]>(...parameters: T): QueryResult<T>;
    queryFirst<T extends QueryParameter[]>(key: Query<T>): Entity | undefined;
    queryFirst<T extends QueryParameter[]>(...parameters: T): Entity | undefined;
    onQueryAdd<T extends QueryParameter[]>(key: Query<T>, callback: (entity: Entity) => void): QueryUnsubscriber;
    onQueryAdd<T extends QueryParameter[]>(parameters: T, callback: (entity: Entity) => void): QueryUnsubscriber;
    onQueryRemove<T extends QueryParameter[]>(key: Query<T>, callback: (entity: Entity) => void): QueryUnsubscriber;
    onQueryRemove<T extends QueryParameter[]>(parameters: T, callback: (entity: Entity) => void): QueryUnsubscriber;
    onAdd<T extends Trait>(trait: T, callback: (entity: Entity) => void): QueryUnsubscriber;
    onAdd<T extends Trait>(relation: Relation<T>, callback: (entity: Entity, target: Entity) => void): QueryUnsubscriber;
    onAdd<T extends Trait>(pair: RelationPair<T>, callback: (entity: Entity, target: Entity) => void): QueryUnsubscriber;
    onAdd(input: Trait | Relation<Trait> | RelationPair, callback: (entity: Entity, target?: Entity) => void): QueryUnsubscriber;
    onRemove<T extends Trait>(trait: T, callback: (entity: Entity) => void): QueryUnsubscriber;
    onRemove<T extends Trait>(relation: Relation<T>, callback: (entity: Entity, target: Entity) => void): QueryUnsubscriber;
    onRemove<T extends Trait>(pair: RelationPair<T>, callback: (entity: Entity, target: Entity) => void): QueryUnsubscriber;
    onRemove(input: Trait | Relation<Trait> | RelationPair, callback: (entity: Entity, target?: Entity) => void): QueryUnsubscriber;
    onChange<T extends Trait>(trait: T, callback: (entity: Entity) => void): QueryUnsubscriber;
    onChange<T extends Trait>(relation: Relation<T>, callback: (entity: Entity, target: Entity) => void): QueryUnsubscriber;
    onChange<T extends Trait>(pair: RelationPair<T>, callback: (entity: Entity, target: Entity) => void): QueryUnsubscriber;
    onChange(input: Trait | Relation<Trait> | RelationPair, callback: (entity: Entity, target?: Entity) => void): QueryUnsubscriber;
};

type ActionRecord = Record<string, (...args: any[]) => void>;
type ActionsInitializer<T extends ActionRecord> = (world: World) => T;
type Actions<T extends ActionRecord> = {
    /** Public read-only ID for fast array lookups */
    readonly id: number;
    /** Initializer function */
    readonly initializer: ActionsInitializer<T>;
} & ((world: World) => T);
type ActionInstance = ActionRecord;

export { $internal as $, type ActionRecord as A, type RelationPair as B, type ConfigurableTrait as C, type RelationTarget as D, type Entity as E, type ExtractIsTag as F, type ExtractSchema as G, type IsTag as H, type InstancesFromParameters as I, type SetTraitCallback as J, type TraitRecord as K, type TraitTuple as L, type Modifier as M, type Norm as N, type OrParameter as O, type TraitValue as P, type QueryParameter as Q, type Relation as R, type Schema as S, type TraitOrRelation as T, type AoSFactory as U, type Store as V, type WorldOptions as W, type StoreType as X, type TraitType as Y, type QueryInstance as Z, type World as a, type ActionsInitializer as b, type Actions as c, type ExtractTraits as d, type Trait as e, type OrModifier as f, type Query as g, type TagTrait as h, type OrderedRelation as i, type ExtractStore as j, type TraitInstance as k, $modifier as l, type EventType as m, type IsNotModifier as n, type QueryModifier as o, type QueryResult as p, type QueryResultOptions as q, type QuerySubscriber as r, type QueryUnsubscriber as s, type QueryHash as t, type StoresFromParameters as u, $queryRef as v, OrderedList as w, $relationPair as x, $relation as y, type RelationInputTarget as z };
