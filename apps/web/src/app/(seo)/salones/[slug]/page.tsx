import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LocalSeoPageView } from '@/components/local-seo-page';
import { absoluteUrl, defaultOgImage, salonBySlug, salonSeoPages } from '@/lib/local-seo';
import { findSalonForSeoSlug, getPublicLanding, imageForPublicSalon, packagesForSalon, titleForPublicSalon } from '@/lib/public-landing';

export const revalidate = 300;

export function generateStaticParams() {
  return salonSeoPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = salonBySlug(slug);
  if (!page) return {};
  const landing = await getPublicLanding();
  const salon = findSalonForSeoSlug(landing, page.slug);
  const image = imageForPublicSalon(salon, page.heroImage) || page.heroImage || defaultOgImage();
  const description = salon?.publicDescription || salon?.publicShortDescription || page.metaDescription;
  const title = salon ? `${titleForPublicSalon(salon)} | M&M Eventos` : page.metaTitle;
  const path = `/salones/${page.slug}`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    keywords: [page.primaryKeyword, ...page.secondaryKeywords],
    openGraph: {
      title,
      description,
      url: absoluteUrl(path),
      type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: salon ? titleForPublicSalon(salon) : page.title }]
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] }
  };
}

export default async function SalonSeoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = salonBySlug(slug);
  if (!page) notFound();
  const landing = await getPublicLanding();
  const salon = findSalonForSeoSlug(landing, page.slug);
  return <LocalSeoPageView page={page} path={`/salones/${page.slug}`} salonMode landing={landing} salon={salon} packages={packagesForSalon(salon)} />;
}
