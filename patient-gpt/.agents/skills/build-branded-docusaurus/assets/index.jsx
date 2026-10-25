import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';

export default function Home() {
  return (
    <Layout title="Documentation" description="Product documentation">
      <main className="container margin-vert--xl">
        <p className="hero__subtitle">Build, explain, and verify the product from one source of truth.</p>
        <Link className="button button--primary" to="docs/intro">
          Read the documentation
        </Link>
      </main>
    </Layout>
  );
}
