import { Container } from "@/components/layout/container";
export function LegalPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Container>
      <article className="legal-page">
        <p className="eyebrow">Development placeholder</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="placeholder-callout">
          <strong>Not for legal reliance</strong>
          <p>
            RoleProwl will replace this content following appropriate product,
            security, and legal review.
          </p>
        </div>
      </article>
    </Container>
  );
}
