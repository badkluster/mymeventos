import type { MetadataRoute } from 'next';
import { absoluteUrl, localSeoPages, salonSeoPages } from '@/lib/local-seo';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: absoluteUrl('/'), lastModified: now, changeFrequency: 'weekly', priority: 1 },
    ...localSeoPages.map((page) => ({ url: absoluteUrl(`/${page.slug}`), lastModified: now, changeFrequency: 'monthly' as const, priority: 0.9 })),
    ...salonSeoPages.map((page) => ({ url: absoluteUrl(`/salones/${page.slug}`), lastModified: now, changeFrequency: 'monthly' as const, priority: 0.85 }))
  ];
}
