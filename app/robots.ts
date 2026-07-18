import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/favicon.ico"],
    },
    host: "https://scribooapp.com",
  };
}
