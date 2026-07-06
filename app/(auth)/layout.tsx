export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-display-md text-foreground">My Recipes</h1>
          <p className="mt-1 text-sm text-muted-foreground">A private collection, just for us.</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft-lg">
          {children}
        </div>
      </div>
    </div>
  );
}
