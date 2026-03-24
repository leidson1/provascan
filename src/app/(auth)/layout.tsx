export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 to-slate-900 p-4">
      {children}
    </div>
  );
}
