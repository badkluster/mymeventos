import type { MetadataRoute } from 'next';
import { absoluteUrl, localSeoPages, salonSeoPages } from '@/lib/local-seo';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1 },
    ...localSeoPages.map((page) => ({ url: absoluteUrl(`/${page.slug}`), changeFrequency: 'monthly' as const, priority: 0.9 })),
    ...salonSeoPages.map((page) => ({ url: absoluteUrl(`/salones/${page.slug}`), changeFrequency: 'monthly' as const, priority: 0.85 })),
    { url: absoluteUrl('/privacidad'), changeFrequency: 'yearly', priority: 0.3 },
    { url: absoluteUrl('/terminos'), changeFrequency: 'yearly', priority: 0.3 }
  ];
}
