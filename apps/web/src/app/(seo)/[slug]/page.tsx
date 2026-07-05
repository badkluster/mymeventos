import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LocalSeoPageView } from '@/components/local-seo-page';
import { absoluteUrl, defaultOgImage, localSeoPages, pageBySlug } from '@/lib/local-seo';
import { findSalonForSeoSlug, getPublicLanding, imageForPublicSalon, packagesForSalon, titleForPublicSalon } from '@/lib/public-landing';

export const revalidate = 3600;

export function generateStaticParams() {
  return localSeoPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = pageBySlug(slug);
  if (!page) return {};
  const landing = await getPublicLanding();
  const salon = findSalonForSeoSlug(landing, page.slug);
  const image = imageForPublicSalon(salon, page.heroImage) || page.heroImage || defaultOgImage();
  const description = salon?.publicDescription || salon?.publicShortDescription || page.metaDescription;
  const path = `/${page.slug}`;
  return {
    title: page.metaTitle,
    description,
    alternates: { canonical: path },
    keywords: [page.primaryKeyword, ...page.secondaryKeywords],
    openGraph: {
      title: page.metaTitle,
      description,
      url: absoluteUrl(path),
      type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: salon ? titleForPublicSalon(salon) : page.title }]
    },
    twitter: { card: 'summary_large_image', title: page.metaTitle, description, images: [image] }
  };
}

export default async function SeoLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = pageBySlug(slug);
  if (!page) notFound();
  const landing = await getPublicLanding();
  const salon = findSalonForSeoSlug(landing, page.slug);
  return <LocalSeoPageView page={page} path={`/${page.slug}`} landing={landing} salon={salon} packages={packagesForSalon(salon)} />;
}
