import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://remitlend.com";

const locales = ["en", "es", "tl"] as const;

const privateRoutes = [
  "/activity",
  "/admin",
  "/analytics",
  "/loans",
  "/notifications",
  "/remittances",
  "/repay",
  "/request-loan",
  "/send-remittance",
  "/settings",
  "/wallet",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/api/",
          ...locales.flatMap((locale) =>
            privateRoutes.map((route) => `/${locale}${route}`)
          ),
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}