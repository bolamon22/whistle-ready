'use client'

import Link from 'next/link'
import { hasFeature, FeatureKey, TierKey, TIERS, FEATURE_TIERS } from '@/lib/tiers'

interface FeatureGateProps {
  feature: FeatureKey
  tier: TierKey | string | undefined
  children: React.ReactNode
  /** Optional custom locked UI. If omitted, shows the default upgrade prompt. */
  fallback?: React.ReactNode
}

/**
 * Renders children if the org's tier includes the feature.
 * Otherwise renders an upgrade prompt (or custom fallback).
 *
 * @example
 * <FeatureGate feature="ai_assistant" tier={org.subscriptionTier}>
 *   <AIChatWidget />
 * </FeatureGate>
 */
export function FeatureGate({ feature, tier, children, fallback }: FeatureGateProps) {
  if (hasFeature(tier, feature)) return <>{children}</>
  if (fallback !== undefined) return <>{fallback}</>
  return <UpgradePrompt feature={feature} />
}

function UpgradePrompt({ feature }: { feature: FeatureKey }) {
  const requiredTierKey = FEATURE_TIERS[feature]
  const t = TIERS[requiredTierKey]
  return (
    <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm">
      <span className="text-xl">🔒</span>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-700">
          {t.label} feature
        </p>
        <p className="text-slate-500 text-xs mt-0.5">
          This feature requires the <strong>{t.label}</strong> plan ({t.price}).
        </p>
      </div>
      <Link
        href="/admin/org-settings"
        className="shrink-0 text-xs bg-slate-800 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 font-medium"
      >
        Upgrade
      </Link>
    </div>
  )
}

/**
 * Inline lock badge — use to show a locked indicator inside nav items or buttons.
 */
export function FeatureLockBadge({ feature, tier }: { feature: FeatureKey; tier: TierKey | string | undefined }) {
  if (hasFeature(tier, feature)) return null
  const requiredTierKey = FEATURE_TIERS[feature]
  const t = TIERS[requiredTierKey]
  return (
    <span className="ml-1.5 text-xs bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-medium">
      {t.label}
    </span>
  )
}
