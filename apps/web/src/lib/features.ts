/**
 * Client-side feature dependency helpers.
 *
 * The server is the source of truth — `provision` re-resolves and re-validates
 * dependencies. These helpers exist only so the wizard gives immediate feedback:
 * checking "Deals" visibly pulls in "Pipelines", and unchecking a feature that
 * others depend on is prevented rather than silently reversed by the server.
 */

import type { CatalogCategoryGroup } from './types'

export interface FeatureIndex {
  /** feature id → its direct dependency ids */
  deps: Map<string, string[]>
  /** feature id → ids that directly depend on it */
  dependents: Map<string, string[]>
  /** feature id → display name */
  names: Map<string, string>
}

export function indexFeatures(groups: CatalogCategoryGroup[]): FeatureIndex {
  const deps = new Map<string, string[]>()
  const dependents = new Map<string, string[]>()
  const names = new Map<string, string>()

  for (const group of groups) {
    for (const f of group.features) {
      deps.set(f.id, f.dependencies)
      names.set(f.id, f.name)
    }
  }
  for (const [id, ds] of deps) {
    for (const d of ds) {
      const list = dependents.get(d) ?? []
      list.push(id)
      dependents.set(d, list)
    }
  }
  return { deps, dependents, names }
}

/** All ids reachable from `seed` by following dependencies (the closure). */
export function closeDependencies(seed: Iterable<string>, index: FeatureIndex): Set<string> {
  const out = new Set<string>()
  const stack = [...seed]
  while (stack.length > 0) {
    const id = stack.pop()
    if (id === undefined || out.has(id)) continue
    out.add(id)
    for (const dep of index.deps.get(id) ?? []) stack.push(dep)
  }
  return out
}

/** The enabled features (from `enabled`) that directly require `id`. */
export function enabledDependentsOf(
  id: string,
  enabled: Set<string>,
  index: FeatureIndex,
): string[] {
  return (index.dependents.get(id) ?? []).filter((d) => enabled.has(d))
}
