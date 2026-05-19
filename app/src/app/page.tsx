import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default function Home() {
  const user = getSession();
  if (!user) redirect("/login");
  redirect(user.role === "admin" ? "/admin/clients" : "/account");
}
