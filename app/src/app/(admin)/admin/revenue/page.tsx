import { mockUsers } from "@/lib/mock-data";
import { PLAN_LIMITS } from "@/lib/types";

export default function AdminRevenuePage() {
  const clients = mockUsers.filter((u) => u.role === "client");
  const mrr = clients.reduce(
    (sum, u) => sum + PLAN_LIMITS[u.plan].priceCad,
    0,
  );
  const arr = mrr * 12;
  const avg = clients.length === 0 ? 0 : Math.round(mrr / clients.length);

  const distribution: { plan: string; count: number; revenue: number }[] = [
    "starter",
    "pro",
    "authority",
  ].map((p) => {
    const c = clients.filter((u) => u.plan === p);
    return {
      plan: p,
      count: c.length,
      revenue: c.reduce((s, u) => s + PLAN_LIMITS[u.plan].priceCad, 0),
    };
  });

  return (
    <>
      <h1 className="display text-[36px] mb-2">Revenue</h1>
      <p className="text-text-muted text-[13px] mb-8">
        Live numbers from Stripe (mocked in this scaffold).
      </p>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <Stat label="MRR" value={`$${mrr.toLocaleString()} CAD`} />
        <Stat label="ARR" value={`$${arr.toLocaleString()} CAD`} />
        <Stat label="Avg revenue / client" value={`$${avg.toLocaleString()} CAD`} />
      </div>

      <div className="bg-bg-elev border border-border rounded-[16px] p-6">
        <h2 className="display text-[18px] mb-5">Plan distribution</h2>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-text-muted text-[11px] uppercase tracking-wider border-b border-border">
              <th className="text-left p-3 font-medium">Plan</th>
              <th className="text-left p-3 font-medium">Active</th>
              <th className="text-left p-3 font-medium">Monthly revenue</th>
              <th className="text-left p-3 font-medium">Share</th>
            </tr>
          </thead>
          <tbody>
            {distribution.map((d) => (
              <tr key={d.plan} className="border-b border-border last:border-0">
                <td className="p-3 capitalize">{d.plan}</td>
                <td className="p-3">{d.count}</td>
                <td className="p-3">${d.revenue.toLocaleString()} CAD</td>
                <td className="p-3 text-text-muted">
                  {mrr === 0 ? "—" : `${Math.round((d.revenue / mrr) * 100)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-5 rounded-[16px] bg-bg-elev border border-border">
      <div className="text-[12px] text-text-muted">{label}</div>
      <div className="display text-[32px] mt-1">{value}</div>
    </div>
  );
}
