const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const helmet = require("helmet");
const compression = require("compression");
const { XMLParser } = require("fast-xml-parser");

// Compute content hashes for cache busting
function computeFileHash(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash("md5").update(content).digest("hex").substring(0, 8);
  } catch { return Date.now().toString(36); }
}

const assetHashes = {
  css: computeFileHash(path.join(__dirname, "public", "css", "styles.css")),
  js: computeFileHash(path.join(__dirname, "public", "js", "main.js")),
};
console.log("Asset hashes:", assetHashes);

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

// Permissions-Policy header
app.use((req, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  next();
});

// Compression
app.use(compression({ threshold: 1024 }));

// Startup-time CSS/JS minification
function minifyCSS(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{}:;,])\s*/g, '$1').replace(/;}/g, '}').trim();
}
function minifyJS(js) {
  return js.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
}

const minifiedCSS = minifyCSS(fs.readFileSync(path.join(__dirname, "public", "css", "styles.css"), "utf8"));
const minifiedJS = minifyJS(fs.readFileSync(path.join(__dirname, "public", "js", "main.js"), "utf8"));

// Serve minified CSS and JS
app.get("/css/styles.css", (req, res) => {
  res.type("css").set("Cache-Control", "no-cache").send(minifiedCSS);
});
app.get("/js/main.js", (req, res) => {
  res.type("js").set("Cache-Control", "no-cache").send(minifiedJS);
});

// Cache HTML template at startup with hash replacements applied
const htmlTemplate = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8")
  .replace(/styles\.css\?v=\w+/g, `styles.css?v=${assetHashes.css}`)
  .replace(/main\.js\?v=\w+/g, `main.js?v=${assetHashes.js}`);

// Serve index.html from cached template
app.get("/", (req, res) => {
  res.type("html").send(htmlTemplate);
});

// Static files with caching
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: "7d",
  etag: true,
  index: false,
  dotfiles: "deny",
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".html") || filePath.endsWith(".css") || filePath.endsWith(".js")) {
      res.set("Cache-Control", "no-cache");
    }
  },
}));

// Health endpoint
app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

// Blog posts from Substack RSS - cached in memory for 1 hour
let blogCache = { posts: [], fetchedAt: 0 };
const BLOG_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const SUBSTACK_FEED = "https://thecloudguy.substack.com/feed";

async function fetchBlogPosts() {
  if (Date.now() - blogCache.fetchedAt < BLOG_CACHE_TTL && blogCache.posts.length > 0) {
    return blogCache.posts;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(SUBSTACK_FEED, { signal: controller.signal });
    clearTimeout(timeoutId);
    const xml = await res.text();
    const xmlParser = new XMLParser({
      ignoreAttributes: false,
      parseTagValue: false,
      trimValues: true,
    });
    const parsed = xmlParser.parse(xml);
    const rawItems = parsed?.rss?.channel?.item;
    const itemList = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
    const posts = [];
    for (const item of itemList.slice(0, 3)) {
      const title = (item.title || "").toString();
      const link = (item.link || "").toString();
      const desc = (item.description || "").toString();
      const pubDate = (item.pubDate || "").toString();
      const cleanText = desc.replace(/<[^>]+>/g, "")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
      // Truncate at word boundary near 150 chars
      let excerpt = cleanText.substring(0, 150);
      if (cleanText.length > 150) {
        excerpt = excerpt.substring(0, excerpt.lastIndexOf(" ")) + "...";
      }
      if (title && link && /^https?:\/\//i.test(link)) {
        posts.push({ title, link, excerpt, date: pubDate });
      }
    }
    blogCache = { posts, fetchedAt: Date.now() };
    return posts;
  } catch (err) {
    console.error("RSS fetch error:", err.message);
    return blogCache.posts; // return stale cache on error
  }
}

// Prefetch on startup
fetchBlogPosts();

app.get("/api/blog", async (req, res) => {
  const posts = await fetchBlogPosts();
  res.json(posts);
});

// Certification verification links from env
app.get("/api/certs", (req, res) => {
  const certs = {
    terraform: process.env.CREDLY_TERRAFORM || "",
    "aws-sa": process.env.CREDLY_AWS_SA || "",
    "gcp-pca": process.env.CREDLY_GCP_PCA || "",
    finops: process.env.CREDLY_FINOPS || "",
    "azure-admin": process.env.CREDLY_AZURE_ADMIN || "",
    "vmware-vcp": process.env.CREDLY_VMWARE_VCP || "",
    "safe-devops": process.env.CREDLY_SAFE_DEVOPS || "",
  };
  res.json(certs);
});

// 404 handler
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
