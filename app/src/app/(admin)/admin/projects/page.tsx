import Link from "next/link";
import { StatusPill } from "@/components/StatusPill";
import { getAllProjects, getUserById, getFilesForProject } from "@/lib/mock-data";
import { LOCATION_LABEL } from "@/lib/types";
import { formatDate } from "@/lib/format";

export default function AdminProjectsPage() {
  const projects = getAllProjects();

  return (
    <>
      <h1 className="display text-[36px] mb-2">All projects</h1>
      <p className="text-text-muted text-[13px] mb-8">
        Every session across all clients, sorted by most recent.
      </p>

      <div className="bg-bg-elev border border-border rounded-[16px] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-text-muted text-[11px] uppercase tracking-wider border-b border-border">
              <th className="text-left p-4 font-medium">Project</th>
              <th className="text-left p-4 font-medium">Client</th>
              <th className="text-left p-4 font-medium">Location</th>
              <th className="text-left p-4 font-medium">Recorded</th>
              <th className="text-left p-4 font-medium">Files</th>
              <th className="text-left p-4 font-medium">Status</th>
              <th className="text-right p-4 font-medium">Open</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const user = getUserById(p.userId);
              const fileCount = getFilesForProject(p.id).length;
              return (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-bg-elev-2">
                  <td className="p-4 font-medium">{p.title}</td>
                  <td className="p-4 text-text-muted">
                    {user ? `${user.firstName} ${user.lastName}` : "?"}
                  </td>
                  <td className="p-4">{LOCATION_LABEL[p.location]}</td>
                  <td className="p-4 text-text-muted">{formatDate(p.recordedAt)}</td>
                  <td className="p-4">{fileCount}</td>
                  <td className="p-4">
                    <StatusPill status={p.status} />
                  </td>
                  <td className="p-4 text-right">
                    <Link
                      href={`/account/projects/${p.id}`}
                      className="px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px]"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
