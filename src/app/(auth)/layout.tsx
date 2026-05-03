// Auth route group layout. Centered single-column shell for sign-in /
// sign-up surfaces. No nav chrome — the user is not yet authenticated.
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-svh flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
