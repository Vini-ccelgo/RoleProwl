import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
export function AppPlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="app-page">
      <PageHeader title={title} description={description} />
      <EmptyState title={title} />
    </div>
  );
}
