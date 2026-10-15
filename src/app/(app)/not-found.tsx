import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg rounded-lg border bg-card p-8 text-center">
      <h2 className="text-lg font-semibold">Not found</h2>
      <p className="mt-2 text-sm text-muted-foreground">This item doesn&apos;t exist or your current role doesn&apos;t have access to it.</p>
      <Link href="/" className="mt-4 inline-block text-sm text-indigo-700 hover:underline">
        Back to dashboard
      </Link>
    </div>
  );
}
