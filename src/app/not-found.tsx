import Link from "next/link";
export default function NotFound() {
  return (
    <main className="standalone">
      <p className="eyebrow">404</p>
      <h1>That trail ends here.</h1>
      <p>We couldn’t find the page you requested.</p>
      <Link className="button button-primary" href="/">
        Return home
      </Link>
    </main>
  );
}
