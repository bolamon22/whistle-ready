import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import NavBar from './NavBar'
import DynamicTitle from './DynamicTitle'
import Providers from './providers'
import ThemeShell from './ThemeShell'

export const metadata: Metadata = {
  title: 'Gameday Blueprint',
  description: 'The Sports Management Master Plan',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Providers>
          <ThemeShell />
          <NavBar />
          <DynamicTitle />
          <main className="p-6 max-w-screen-2xl mx-auto">{children}</main>
          <Toaster position="top-right" toastOptions={{ style: { borderRadius: '10px', fontFamily: 'inherit', fontSize: '14px' } }}/>
        </Providers>
      </body>
    </html>
  )
}
