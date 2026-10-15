import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SubmissionTable } from "@/components/submission-table";
import { buttonVariants } from "@/components/ui/button";
import { canSubmit, getCurrentUser, isReviewer, submissionScope } from "@/lib/auth";
import { listSubmissions } from "@/lib/queries";

export default async function SubmissionsPage() {
  const user = await getCurrentUser();
  const rows = await listSubmissions(submissionScope(user));
  const scope = isReviewer(user)
    ? "All submissions across teams and affiliates."
    : user.role === "AFFILIATE"
      ? `Submissions from ${user.affiliateName ?? "your affiliate"} only.`
      : "Submissions from the ClearPath marketing team.";
  return (
    <div>
      <PageHeader
        title={isReviewer(user) ? "All submissions" : "My submissions"}
        description={scope}
        actions={canSubmit(user) && <Link href="/submit" className={buttonVariants()}>Submit content</Link>}
      />
      <SubmissionTable rows={rows} empty="No submissions yet." />
    </div>
  );
}
