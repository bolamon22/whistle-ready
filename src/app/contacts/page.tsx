'use client'

import ContactDirectory from '@/components/contacts/ContactDirectory'

// Event contacts: the org's directory of everyone it works with to put on an
// event. Directors and admins (the `tasks` feature): middleware gates the page
// and /api/contacts gates the data.
export default function ContactsPage() {
  return (
    <div className="max-w-7xl mx-auto">
      <ContactDirectory />
    </div>
  )
}
