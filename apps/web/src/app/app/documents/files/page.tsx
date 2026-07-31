'use client'
import { ModuleIntro } from '@/components/module-intro'
export default function FilesPage() {
  return <ModuleIntro title="Files" subtitle="Your organization's document library" icon="folder"
    requires="Connect a storage provider (Cloudflare R2 / S3 / Supabase) to upload and share files."
    capabilities={[
      { title: 'Upload anything', body: 'Store proposals, assets and shared documents.' },
      { title: 'Organize', body: 'Folders, tags and search across your library.' },
      { title: 'Share securely', body: 'Per-file access controlled by your roles.' },
    ]} />
}
