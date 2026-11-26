import type {Quota} from '../../../src/shared/api.js'
import {quotaLeft} from '../words.js'

function QuotaMeter({quota}: {quota: Quota}) {
  if (!quota.enabled) {
    return <p className="text-sm text-neel-soft">Local models, no daily limit</p>
  }
  const left = quotaLeft(quota)
  const used = Math.min(1, quota.used / Math.max(1, quota.limit))
  return (
    <div className="w-full max-w-56 sm:w-48 sm:text-right">
      <p className="text-sm leading-snug">
        <span className="font-semibold">{left.day}</span> of {quota.limit} free requests left today
      </p>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muslin-deep"
        role="meter"
        aria-label="Free model requests used today"
        aria-valuemin={0}
        aria-valuemax={quota.limit}
        aria-valuenow={quota.used}
      >
        <div className="h-full rounded-full bg-madder" style={{width: `${used * 100}%`}} />
      </div>
      <p className="mt-1 text-xs text-neel-soft">{left.visitor} of them yours</p>
    </div>
  )
}

export function Header({
  quota,
  onReset,
  canReset
}: {
  quota?: Quota
  onReset: () => void
  canReset: boolean
}) {
  return (
    <header className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-7 pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-5xl leading-[0.9] font-bold tracking-tight font-stretch-condensed sm:text-6xl">
          Shohayok
          <span lang="bn" className="ml-3 font-semibold text-neel-soft">
            সহায়ক
          </span>
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-neel-soft">
          The support assistant of Nodi, a made-up clothing shop in Bangladesh. It answers in
          Bangla, Banglish or English, the way you write.
        </p>
        {canReset && (
          <button
            type="button"
            onClick={onReset}
            className="mt-3 text-sm font-medium underline decoration-neel-soft/50 decoration-dotted decoration-2 underline-offset-4 hover:decoration-neel"
          >
            Start a new conversation
          </button>
        )}
      </div>
      {quota && <QuotaMeter quota={quota} />}
    </header>
  )
}
