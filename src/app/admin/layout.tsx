import SuperAdminBar from './SuperAdminBar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SuperAdminBar />
      {children}
    </>
  )
}
