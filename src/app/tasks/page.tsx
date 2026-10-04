'use client'

import TaskBoard from '@/components/tasks/TaskBoard'

// Every task across the org's events, plus General ones that aren't tied to
// one event. Directors and admins (the `tasks` feature): middleware gates the
// page and /api/tasks gates the data.
export default function TasksPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <TaskBoard />
    </div>
  )
}
