import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { requireAdmin } from "@/lib/session";

const NAV = [
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/projects", label: "All projects" },
  { href: "/admin/revenue", label: "Revenue" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = requireAdmin();
  return (
    <>
      <TopNav user={user} />
      <div className="flex">
        <aside className="w-[220px] shrink-0 border-r border-border min-h-[calc(100vh-65px)] p-4 sticky top-[65px] self-start">
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
        <main className="flex-1 min-w-0 px-8 py-10">{children}</main>
      </div>
    </>
  );
}
