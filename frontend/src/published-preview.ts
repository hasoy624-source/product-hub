import type { Workspace } from './types'

export type PublishedProjectSnapshot = {
  schema_version: number
  revision: string
  workspace: Workspace
  counts: Record<string, number>
  image_hashes: Record<string, string>
}

export function publishedStorageKey(revision: string) {
  return `zhixu-public-projects-${revision}`
}

export function publishedWorkspace(snapshot: PublishedProjectSnapshot, base = '/') {
  const workspace = structuredClone(snapshot.workspace)
  const prefix = base.endsWith('/') ? base : `${base}/`
  for (const detail of Object.values(workspace.project_details || {})) {
    for (const image of detail.images) {
      image.url = `${prefix}project-assets/${encodeURIComponent(image.filename)}`
    }
  }
  return workspace
}
