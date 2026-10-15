import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SubmissionTable } from "@/components/submission-table";
import { buttonVariants } from "@/components/ui/button";
import { canSubmit, getCurrentUser, isReviewer, submissionScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { listSubmissions } from "@/lib/queries";

export default async function SubmissionsPage() {
  const user = await getCurrentUser();
  const [rows, reviewers] = await Promise.all([
    listSubmissions(submissionScope(user)),
    isReviewer(user) ? db.user.findMany({ where: { role: { in: ["REVIEWER", "ADMIN"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve(undefined),
  ]);
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
      <SubmissionTable rows={rows} reviewers={reviewers} empty="No submissions yet." />
    </div>
  );
}
