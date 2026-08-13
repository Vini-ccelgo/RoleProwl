import { Construction } from "lucide-react";
export function EmptyState({ title }: { title: string }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Construction aria-hidden="true" />
      </span>
      <h2>{title} is being prepared</h2>
      <p>
        This development placeholder establishes the route and shared shell.
        Product functionality arrives in a later RP ticket.
      </p>
    </div>
  );
}
