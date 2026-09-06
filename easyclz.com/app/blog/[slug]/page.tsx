import { posts } from '../data';
import BlogPostClient from './BlogPostClient';

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.key }));
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <BlogPostClient slug={slug} />;
}
