import Link from 'next/link'
import { Search, LogIn, ChevronRight } from 'lucide-react'

// The first screen of the Whistle Ready iOS app for someone not signed in.
// page.tsx shows it instead of the organizer landing when the request comes from
// the app (user agent "WhistleReadyApp/"); browsers never see it. Parents and
// fans go straight to an event with no login; everyone with an account signs in
// and lands on their role's home, exactly as on the phone website.
export default function AppStart() {
  return (
    <div className="-m-3 sm:-m-6 min-h-[100dvh] bg-white flex flex-col px-6 pt-[calc(env(safe-area-inset-top,0px)+3rem)] pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <img src="/icon-512.png" alt="" width={96} height={96} className="w-24 h-24 rounded-[1.6rem] shadow-lg shadow-teal-900/20" />
        <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-900">Whistle Ready</h1>
        <p className="mt-1 text-base font-semibold text-teal-700">Get Whistle Ready.</p>
        <p className="mt-3 max-w-xs text-sm text-slate-500">Schedules, scores and brackets for your tournament, and game-day tools for the people running it.</p>
      </div>

      <div className="w-full max-w-sm mx-auto space-y-3">
        <Link href="/find"
          className="flex items-center gap-3 w-full min-h-[64px] rounded-2xl bg-teal-600 px-5 text-white shadow-sm active:bg-teal-700">
          <Search size={22} className="flex-shrink-0" />
          <span className="flex-1 text-left">
            <span className="block text-base font-bold leading-tight">Find a tournament</span>
            <span className="block text-[13px] text-teal-50/90 leading-tight mt-0.5">Parents and fans · no login needed</span>
          </span>
          <ChevronRight size={20} className="flex-shrink-0 opacity-80" />
        </Link>

        <Link href="/login"
          className="flex items-center gap-3 w-full min-h-[64px] rounded-2xl border border-slate-300 bg-white px-5 text-slate-900 active:bg-slate-50">
          <LogIn size={22} className="flex-shrink-0 text-teal-700" />
          <span className="flex-1 text-left">
            <span className="block text-base font-bold leading-tight">Sign in</span>
            <span className="block text-[13px] text-slate-500 leading-tight mt-0.5">Staff, coaches, club directors and parents with an account</span>
          </span>
          <ChevronRight size={20} className="flex-shrink-0 text-slate-400" />
        </Link>

        <p className="pt-3 text-center text-sm text-slate-500">
          New here? <Link href="/register" className="font-semibold text-teal-700">Create an account</Link>
        </p>
      </div>
    </div>
  )
}
