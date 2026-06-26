import { auth } from "@/auth"
import { logoutAction } from "@/app/actions/auth"
import { documentService } from "@/server/services/document.service"
import { redirect } from "next/navigation"
import DashboardClient from "@/components/dashboard-client"

export default async function Home() {
  const session = await auth()

  if (!session?.user) {
    redirect("/login")
  }

  const rawDocuments = await documentService.listUserDocuments(session.user.id!)
  const documents = rawDocuments.map((d) => ({
    ...d,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }))

  return (
    <div className="min-h-screen bg-bg-base text-text-primary flex flex-col">
      <header className="border-b border-border-subtle bg-bg-base/60 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-8 py-3.5 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-[34px] h-[34px] rounded-md bg-accent-gradient flex items-center justify-center text-white shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </div>
            <span className="text-xl font-extrabold tracking-tight bg-accent-gradient bg-clip-text text-transparent">CollabEdit</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right flex flex-col">
              <span className="text-sm font-semibold text-text-primary">{session.user.name}</span>
              <span className="text-[0.775rem] text-text-muted">{session.user.email}</span>
            </div>
            <form action={logoutAction}>
              <button type="submit" className="bg-bg-hover border border-border-default rounded-md px-4 py-2 text-text-secondary text-[0.825rem] font-semibold cursor-pointer transition-all duration-150 hover:bg-danger-bg hover:border-danger-border hover:text-danger-text" id="logout-btn">
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-8 py-12 flex flex-col gap-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-[2.75rem] font-extrabold tracking-tight text-text-primary leading-[1.1]">Your Workspace</h1>
          <p className="text-[1.05rem] text-text-secondary">
            Create, collaborate, and sync documents in real-time
          </p>
        </div>

        <section>
          <DashboardClient
            documents={documents}
            userName={session.user.name ?? ""}
            userEmail={session.user.email ?? ""}
          />
        </section>
      </main>
    </div>
  )
}
