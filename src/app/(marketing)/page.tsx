import { ArrowRight, Check, Play, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { ProductPreview } from "@/components/marketing/product-preview";
import { SearchControl } from "@/components/jobs/search-control";
import { features, principles, workflowSteps } from "@/config/marketing";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { databaseClient } from "@/lib/db/client";
import { searchRunIsActive } from "@/features/jobs/manual-discovery";
import { resolveWorkspaceAdmission } from "@/features/accounts/require-authenticated-actor";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    account_deleted?: string;
    account_deletion_pending?: string;
  }>;
}) {
  const query = await searchParams;
  const admission = await resolveWorkspaceAdmission(currentAuthProvider());
  if (admission.status === "ALLOWED") {
    const actor = admission.actor;
    const database = databaseClient();
    const [searchState, activeJobs, pendingReviews, unreadNotifications] =
      await Promise.all([
        database.jobSearchState.findUnique({ where: { userId: actor.id } }),
        database.job.count({ where: { status: "ACTIVE" } }),
        database.reviewQueueItem.count({
          where: { userId: actor.id, status: { in: ["PENDING", "DEFERRED"] } },
        }),
        database.notification.count({
          where: { userId: actor.id, readAt: null },
        }),
      ]);
    return (
      <Section className="authenticated-home">
        <Container>
          <header className="page-header">
            <p className="eyebrow">RoleProwl Home</p>
            <h1>What’s next</h1>
            <p>
              Start discovery, then review the real opportunities and decisions
              already waiting in your workspace.
            </p>
          </header>
          <SearchControl
            active={searchRunIsActive(searchState)}
            lastRun={
              searchState
                ? {
                    status: searchState.status,
                    startedAt: searchState.startedAt.toISOString(),
                    completedAt: searchState.completedAt?.toISOString() ?? null,
                    discoveredCount: searchState.discoveredCount,
                    newCount: searchState.newCount,
                    failureMessage: searchState.failureMessage,
                  }
                : null
            }
          />
          <section className="home-next-actions" aria-label="Current workspace">
            <Button href="/jobs" variant="secondary">
              <strong>{activeJobs}</strong> active jobs
            </Button>
            <Button href="/queue" variant="secondary">
              <strong>{pendingReviews}</strong> reviews need attention
            </Button>
            <Button href="/notifications" variant="secondary">
              <strong>{unreadNotifications}</strong> unread notifications
            </Button>
            <Button href="/profile" variant="secondary">
              Review your Truth Vault
            </Button>
          </section>
        </Container>
      </Section>
    );
  }

  return (
    <>
      {query.account_deleted === "1" ? (
        <Section>
          <Container>
            <p className="card m-0 border-brand p-4 text-sm" role="status">
              Your RoleProwl account and stored candidate data were deleted.
            </p>
          </Container>
        </Section>
      ) : query.account_deletion_pending === "1" ? (
        <Section>
          <Container>
            <p className="card m-0 border-danger p-4 text-sm" role="status">
              Account deletion requires cleanup. RoleProwl has not reported the
              deletion as complete.
            </p>
          </Container>
        </Section>
      ) : null}
      <Section className="hero">
        <div className="topo" aria-hidden="true" />
        <Container className="hero-grid">
          <div className="hero-copy">
            <span className="hero-badge">
              <Search size={16} /> AI-powered job search for real people
            </span>
            <h1>
              Find the right opportunities.
              <br />
              <span>Move your career forward.</span>
            </h1>
            <p className="hero-lede">
              RoleProwl discovers opportunities, evaluates your fit, prepares
              truthful applications, and tracks your progress—so you can focus
              on interviews, not busywork.
            </p>
            <div className="hero-ctas">
              <Button href="/onboarding">
                <Search size={20} />
                Start Your Search
              </Button>
              <Button href="#how-it-works" variant="secondary">
                <Play size={20} />
                See How It Works
              </Button>
            </div>
            <div className="principles">
              {principles.map(({ title, icon: Icon }) => (
                <div key={title}>
                  <span>
                    <Icon />
                  </span>
                  <strong>{title}</strong>
                  <Check size={16} className="principle-check" />
                </div>
              ))}
            </div>
          </div>
          <div className="hero-preview">
            <ProductPreview />
          </div>
        </Container>
        <div className="trail" aria-hidden="true" />
      </Section>
      <Section id="how-it-works" className="workflow">
        <Container>
          <header className="section-heading">
            <span />
            <h2>How RoleProwl Works</h2>
            <span />
          </header>
          <div className="workflow-grid">
            {workflowSteps.map(({ title, text, icon: Icon }, index) => (
              <article className="workflow-card" key={title}>
                <b>{index + 1}</b>
                <Icon aria-hidden="true" />
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </Container>
      </Section>
      <Section className="features">
        <Container>
          <header className="section-heading">
            <span />
            <h2>Powerful Features Built for Job Seekers</h2>
            <span />
          </header>
          <div className="feature-grid">
            {features.map(({ title, text, icon: Icon }) => (
              <article className="feature-card" key={title}>
                <Icon aria-hidden="true" />
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="closing-cta">
            <div>
              <p className="eyebrow">Your next opportunity is out there</p>
              <h2>Track it with purpose.</h2>
            </div>
            <Button href="/onboarding">
              Start Your Search <ArrowRight size={18} />
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
