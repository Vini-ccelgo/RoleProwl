import { ArrowRight, Check, Play, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { ProductPreview } from "@/components/marketing/product-preview";
import { features, principles, workflowSteps } from "@/config/marketing";

export default function HomePage() {
  return (
    <>
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
