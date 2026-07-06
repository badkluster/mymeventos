import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/local-seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/backoffice', '/api'] },
    sitemap: absoluteUrl('/sitemap.xml')
  };
}
