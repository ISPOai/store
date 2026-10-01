import { W as WorldOptions, a as World, C as ConfigurableTrait, A as ActionRecord, b as ActionsInitializer, c as Actions, E as Entity, T as TraitOrRelation, M as Modifier, d as ExtractTraits, e as Trait, O as OrParameter, f as OrModifier, Q as QueryParameter, g as Query, h as TagTrait, S as Schema, R as Relation, i as OrderedRelation, j as ExtractStore, N as Norm, k as TraitInstance } from './types-DONaXEhM.cjs';
export { $ as $internal, l as $modifier, v as $queryRef, y as $relation, x as $relationPair, U as AoSFactory, m as EventType, F as ExtractIsTag, G as ExtractSchema, I as InstancesFromParameters, n as IsNotModifier, H as IsTag, w as OrderedList, t as QueryHash, Z as QueryInstance, o as QueryModifier, p as QueryResult, q as QueryResultOptions, r as QuerySubscriber, s as QueryUnsubscriber, z as RelationInputTarget, B as RelationPair, D as RelationTarget, J as SetTraitCallback, V as Store, X as StoreType, u as StoresFromParameters, K as TraitRecord, L as TraitTuple, Y as TraitType, P as TraitValue } from './types-DONaXEhM.cjs';

declare function createWorld(options: WorldOptions): World;
declare function createWorld(...traits: ConfigurableTrait[]): World;

declare function createActions<T extends ActionRecord>(initializer: ActionsInitializer<T>): Actions<T>;

declare function unpackEntity(entity: Entity): {
    worldId: number;
    generation: number;
    entityId: number;
};

declare function shallowEqual(obj1: any, obj2: any): boolean;

declare function createAdded(): <T extends TraitOrRelation[]>(...inputs: T) => Modifier<ExtractTraits<T>, `added-${number}`>;

declare function createChanged(): <T extends TraitOrRelation[]>(...inputs: T) => Modifier<ExtractTraits<T>, `changed-${number}`>;

declare const Not: <T extends Trait[] = Trait[]>(...traits: T) => Modifier<T, "not">;

declare const Or: <T extends OrParameter[]>(...params: T) => OrModifier<T>;

declare function createRemoved(): <T extends TraitOrRelation[]>(...inputs: T) => Modifier<ExtractTraits<T>, `removed-${number}`>;

declare const IsExcluded: TagTrait;
declare function createQuery<T extends QueryParameter[]>(...parameters: T): Query<T>;

/**
 * Creates a relation definition.
 * Relations are stored efficiently - one trait per relation type, not per target.
 * Targets are stored in TraitInstance.relationTargets.
 */
declare function createRelation<S extends Schema = Record<string, never>>(definition?: {
    exclusive?: boolean;
    autoDestroy?: 'orphan' | 'source' | 'target';
    /** @deprecated Use `autoDestroy: 'orphan'` instead */
    autoRemoveTarget?: boolean;
    store?: S;
}): Relation<Trait<S>>;
declare const relation: typeof createRelation;

/**
 * Creates a trait that maintains an ordered list of entities related by a relation.
 * The list automatically syncs with the relation - adding/removing from the list
 * adds/removes the relation pair, and vice versa.
 *
 * @experimental This API is experimental and may change in future versions.
 * Please provide feedback on GitHub or Discord.
 *
 * @example
 * ```ts
 * const ChildOf = relation();
 * const OrderedChildren = ordered(ChildOf);
 *
 * const parent = world.spawn(OrderedChildren);
 * const children = parent.get(OrderedChildren);
 * children.push(child1); // adds ChildOf(parent) to child1
 * children.splice(0, 1); // removes ChildOf(parent) from child1
 * ```
 */
declare function ordered<T extends Trait>(relation: Relation<T>): OrderedRelation<T>;

declare function createTrait(schema?: undefined | Record<string, never>): TagTrait;
declare function createTrait<S extends Schema>(schema: S): Trait<Norm<S>>;
declare const trait: typeof createTrait;
declare function getStore<C extends Trait = Trait>(world: World, trait: C): ExtractStore<C>;

type WorldIndex = {
    worldCursor: number;
    releasedWorldIds: number[];
    maxWorlds: number;
};

declare const universe: {
    worlds: (World | null)[];
    cachedQueries: Map<string, Query<any>>;
    worldIndex: WorldIndex;
    reset: () => void;
};

/** @deprecated Use createQuery instead */
declare const cacheQuery: typeof createQuery;

/** @deprecated Use TraitInstance instead */
type TraitData = TraitInstance;

export { ActionRecord, Actions, ActionsInitializer, ConfigurableTrait, Entity, ExtractStore, IsExcluded, Modifier, Norm, Not, Or, OrderedRelation as OrderedTrait, Query, QueryParameter, Relation, Schema, TagTrait, Trait, type TraitData, TraitInstance, World, WorldOptions, cacheQuery, createActions, createAdded, createChanged, createQuery, createRemoved, createWorld, getStore, ordered, relation, shallowEqual, trait, universe, unpackEntity };
