import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import NavBar from './NavBar'
import Providers from './providers'

export const metadata: Metadata = {
  title: 'GameDay Staff',
  description: 'Tournament staff scheduling',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Providers>
          <NavBar />
          <main className="p-6 max-w-screen-2xl mx-auto">{children}</main>
          <Toaster position="top-right" toastOptions={{ style: { borderRadius: '10px', fontFamily: 'inherit', fontSize: '14px' } }}/>
        </Providers>
      </body>
    </html>
  )
}
