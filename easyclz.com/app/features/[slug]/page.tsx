import { features } from '../data';
import FeatureDetailClient from './FeatureDetailClient';

export function generateStaticParams() {
  return features.map((f) => ({ slug: f.key }));
}

export default async function FeatureDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <FeatureDetailClient slug={slug} />;
}
