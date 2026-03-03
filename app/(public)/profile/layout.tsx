import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { ProfileNav } from "./profile-nav";

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/profile");

  return (
    <div className="container px-4 py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 md:flex-row">
        <aside className="w-full shrink-0 md:w-56">
          <div className="sticky top-24">
            <ProfileNav />
          </div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
