'use client'
import { useEffect } from 'react'
import { useOrg } from '@/lib/org-context'

export default function DynamicTitle() {
  const org = useOrg()
  useEffect(() => {
    if (org?.name) document.title = `${org.name} · Gameday Blueprint`
  }, [org?.name])
  return null
}
