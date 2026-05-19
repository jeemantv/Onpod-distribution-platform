import { requireClient } from "@/lib/session";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  requireClient();
  return <>{children}</>;
}
