import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { crossLinksFor, localSeoPages, pageBySlug, salonBySlug, salonSeoPages } from '@/lib/local-seo';
import { homeStructuredData, localPageStructuredData, organizationId, visibleFaqsFor } from '@/lib/structured-data';
import type { PublicLanding, PublicSalon } from '@/lib/public-landing';

const site = 'https://www.mymsalones.com.ar';

function salon(overrides: Partial<PublicSalon>): PublicSalon {
  return { _id: 'salon', name: 'Salón', ...overrides };
}

function landing(overrides: Partial<PublicLanding> = {}): PublicLanding {
  return {
    settings: { contactPhone: '+54 9 221 000-0000' },
    salons: [
      salon({ _id: 'sc', name: 'M&M San Carlos', locality: 'San Carlos', address: 'Calle 144 N°664' }),
      salon({ _id: 've', name: 'M&M Villa Elisa', locality: 'Villa Elisa', address: 'Calle 419' }),
      salon({ _id: 'lp', name: 'M&M La Plata', locality: 'La Plata', address: 'Calle 22' }),
    ],
    packages: [], promotions: [], gallery: [], testimonials: [], faqs: [], serviceBlocks: [], eventTypes: [], storySteps: [],
    ...overrides,
  };
}

function nodesOfType(nodes: unknown[], type: string) {
  return (nodes as Array<Record<string, unknown>>).filter((node) => node['@type'] === type);
}

describe('SEO surface that must not change', () => {
  it('keeps the 15 sitemap URLs on the canonical www host', () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toHaveLength(15);
    expect(new Set(urls).size).toBe(15);
    expect(urls.every((url) => url.startsWith(`${site}/`))).toBe(true);
    expect(urls).toEqual(expect.arrayContaining([`${site}/fiestas-de-15-la-plata`, `${site}/salones-de-fiestas-la-plata`, `${site}/salon-eventos-villa-elisa`, `${site}/salones/villa-elisa`]));
  });

  it('keeps robots rules and sitemap location', () => {
    expect(robots()).toEqual({ rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/backoffice', '/api'] }, sitemap: `${site}/sitemap.xml` });
  });

  it('keeps the consolidated permanent redirects', async () => {
    const redirects = await nextConfig.redirects!();
    const bySource = Object.fromEntries(redirects.map((item) => [item.source, item]));
    for (const [source, destination] of [
      ['/salon-15-anos-la-plata', '/fiestas-de-15-la-plata'],
      ['/catering-eventos-la-plata', '/catering-la-plata'],
      ['/salon-eventos-la-plata', '/salones-de-fiestas-la-plata'],
      ['/salon-casamientos-la-plata', '/casamientos-la-plata'],
    ]) expect(bySource[source]).toMatchObject({ destination, permanent: true });
  });

  it('keeps titles, descriptions and H1s of every SEO page', () => {
    const surface = [...localSeoPages, ...salonSeoPages].map((page) => ({ slug: page.slug, metaTitle: page.metaTitle, metaDescription: page.metaDescription, h1: page.h1 }));
    expect(surface).toMatchSnapshot();
  });
});

describe('internal links', () => {
  it('links every salon page to its own local landing', () => {
    expect(crossLinksFor(salonBySlug('villa-elisa')!, true).map((link) => link.href)).toContain('/salon-eventos-villa-elisa');
    expect(crossLinksFor(salonBySlug('san-carlos')!, true).map((link) => link.href)).toContain('/salon-fiestas-san-carlos');
    expect(crossLinksFor(salonBySlug('la-plata')!, true).map((link) => link.href)).toContain('/salones-de-fiestas-la-plata');
  });

  it('keeps the existing salon-page links in their previous order', () => {
    expect(crossLinksFor(salonBySlug('la-plata')!, true).map((link) => link.href)).toEqual(localSeoPages.slice(0, 4).map((page) => `/${page.slug}`));
  });

  it('links topic landings to the three salon pages', () => {
    expect(crossLinksFor(pageBySlug('fiestas-de-15-la-plata')!, false).map((link) => link.href)).toEqual(['/salones/la-plata', '/salones/san-carlos', '/salones/villa-elisa']);
  });

  it('only references pages that exist', () => {
    for (const page of localSeoPages) for (const slug of page.relatedSlugs) expect(pageBySlug(slug), `${page.slug} -> ${slug}`).toBeDefined();
    for (const page of salonSeoPages) {
      for (const slug of page.relatedSlugs) expect(salonBySlug(slug), `${page.slug} -> ${slug}`).toBeDefined();
      expect(pageBySlug(page.localLandingSlug!), page.slug).toBeDefined();
    }
  });
});

describe('structured data', () => {
  it('home: one organization linked to its venues, no department on a Place', () => {
    const nodes = homeStructuredData(landing({ faqs: [{ question: '¿Puedo visitar?', answer: 'Sí.' }] }));
    expect(JSON.stringify(nodes)).not.toContain('department');
    const [organization] = nodesOfType(nodes, 'Organization');
    expect(organization['@id']).toBe(organizationId);
    const venues = nodesOfType(nodes, 'EventVenue');
    expect(venues.map((venue) => venue.url)).toEqual([`${site}/salones/san-carlos`, `${site}/salones/villa-elisa`, `${site}/salones/la-plata`]);
    expect(organization.location).toEqual(venues.map((venue) => ({ '@id': venue['@id'] })));
    // A single node per type: no duplicated blocks.
    for (const type of ['Organization', 'WebSite', 'FAQPage']) expect(nodesOfType(nodes, type)).toHaveLength(1);
  });

  it('home: omits FAQPage when there are no FAQs and survives a missing CMS', () => {
    expect(nodesOfType(homeStructuredData(landing()), 'FAQPage')).toHaveLength(0);
    expect(nodesOfType(homeStructuredData(null), 'Organization')).toHaveLength(1);
  });

  it('landing: venue points to the canonical salon page and the business is the shared organization', () => {
    const data = landing();
    const page = pageBySlug('salon-eventos-villa-elisa')!;
    const nodes = localPageStructuredData(page, `/${page.slug}`, false, data.salons[1], [], data);
    expect(nodesOfType(nodes, 'LocalBusiness')).toHaveLength(0);
    const [venue] = nodesOfType(nodes, 'EventVenue');
    expect(venue).toMatchObject({ '@id': `${site}/salones/villa-elisa#venue`, url: `${site}/salones/villa-elisa`, name: 'M&M Villa Elisa' });
    const [organization] = nodesOfType(nodes, 'Organization');
    expect(organization['@id']).toBe(organizationId);
    expect((organization.makesOffer as unknown[])[0]).toEqual({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: page.packages[0] } });
    expect(JSON.stringify(nodesOfType(nodes, 'BreadcrumbList'))).toContain(`${site}/salon-eventos-villa-elisa`);
  });

  it('landing: FAQPage always matches the FAQs rendered on the page', () => {
    const page = pageBySlug('fiestas-de-15-la-plata')!;
    for (const data of [landing(), landing({ faqs: [{ question: '¿Hay estacionamiento?', answer: 'Consultanos.' }] }), null]) {
      const [faq] = nodesOfType(localPageStructuredData(page, `/${page.slug}`, false, undefined, [], data), 'FAQPage');
      const marked = (faq.mainEntity as Array<{ name: string }>).map((item) => item.name);
      expect(marked).toEqual(visibleFaqsFor(page, data).map((item) => item.question));
      expect(marked.length).toBeGreaterThan(0);
    }
  });

  it('landing without salon data still names the venue, not the topic', () => {
    const page = pageBySlug('fiestas-de-15-la-plata')!;
    const [venue] = nodesOfType(localPageStructuredData(page, `/${page.slug}`, false, undefined, [], null), 'EventVenue');
    expect(venue.name).toBe('M&M La Plata');
  });
});
