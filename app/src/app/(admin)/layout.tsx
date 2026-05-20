import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { requireEditorOrAdmin } from "@/lib/session";

const ADMIN_NAV = [
  { href: "/admin/studios", label: "Studios" },
  { href: "/admin/edits", label: "Edits" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/team", label: "Team" },
  { href: "/admin/projects", label: "All projects" },
  { href: "/admin/revenue", label: "Revenue" },
  { href: "/admin/settings", label: "Settings" },
];

const EDITOR_NAV = [
  { href: "/admin/edits", label: "Edits" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/studios", label: "Studios" },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/projects", label: "All projects" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = requireEditorOrAdmin();
  const NAV = user.role === "admin" ? ADMIN_NAV : EDITOR_NAV;
  return (
    <>
      <TopNav user={user} />
      <nav className="md:hidden sticky top-[57px] z-40 -mb-px bg-bg/95 backdrop-blur border-b border-border overflow-x-auto">
        <div className="flex items-center gap-1 px-4 py-2 min-w-min">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="px-3 py-1.5 rounded-[8px] text-[12px] text-text-muted hover:text-text hover:bg-bg-elev-2 shrink-0"
            >
              {n.label}
            </Link>
          ))}
        </div>
      </nav>
      <div className="flex">
        <aside className="hidden md:block w-[220px] shrink-0 border-r border-border min-h-[calc(100vh-65px)] p-4 sticky top-[65px] self-start">
          <nav className="flex flex-col gap-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="px-3 py-2 rounded-[8px] text-[13px] text-text-muted hover:text-text hover:bg-bg-elev-2"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="flex-1 min-w-0 px-4 md:px-8 py-6 md:py-10">
          {children}
        </main>
      </div>
    </>
  );
}
