This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Reseñas de Google Maps

La landing consulta Place Details (New) exclusivamente desde el servidor para los tres salones y conserva los testimonios administrados en el backoffice como fallback silencioso. Configurá estas variables en el proyecto de hosting; no deben llevar el prefijo `NEXT_PUBLIC_` ni incluirse en archivos versionados:

```text
GOOGLE_PLACES_API_KEY=
GOOGLE_REVIEWS_REVALIDATE_SECONDS=43200
GOOGLE_REVIEWS_MAX_ITEMS=6
GOOGLE_REVIEWS_FORCE_FALLBACK=false
```

`GOOGLE_PLACES_API_KEY` debe ser una clave distinta, habilitada para Places API (New) y restringida para ejecución server-to-server (por ejemplo, la infraestructura de hosting). Una clave limitada por HTTP referrer no funciona en esta integración y no debe usarse aquí.

Para verificar el fallback en un deployment de QA, configurá temporalmente `GOOGLE_REVIEWS_FORCE_FALLBACK=true`. La landing omitirá Google y mostrará los testimonios manuales existentes.
