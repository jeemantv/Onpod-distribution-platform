import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default function Home() {
  const user = getSession();
  if (!user) redirect("/login");
  const isStaff = user.role === "admin" || (user.role as string) === "editor";
  redirect(isStaff ? "/admin/studios" : "/account");
}
