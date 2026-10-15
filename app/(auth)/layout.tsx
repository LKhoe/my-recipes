import { redirect } from "next/navigation";
import { RecipeBowlMark } from "@/components/icons/RecipeBowlMark";
import { getSession } from "@/lib/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (session?.user) redirect("/recipes");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <RecipeBowlMark className="size-12" />
          <h1 className="mt-2 font-display text-display-md text-foreground">Minhas Receitas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Uma coleção privada, só para nós.</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft-lg">
          {children}
        </div>
      </div>
    </div>
  );
}
