const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const rateLimit = require("express-rate-limit");
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
const SITE_VERSION = process.env.SITE_VERSION || "v2";

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

// Body parsing - scoped size limit
app.use(express.json({ limit: "16kb" }));

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

// CSRF token store
const csrfTokens = new Map();
const CSRF_TTL = 15 * 60 * 1000; // 15 minutes

// Clean expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, expiry] of csrfTokens) {
    if (now > expiry) csrfTokens.delete(token);
  }
}, 5 * 60 * 1000);

const csrfLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many CSRF token requests. Please try again later." },
});

app.get("/api/csrf", csrfLimiter, (req, res) => {
  if (csrfTokens.size > 10000) {
    return res.status(429).json({ error: "Too many pending tokens." });
  }
  const token = crypto.randomBytes(32).toString("hex");
  csrfTokens.set(token, Date.now() + CSRF_TTL);
  res.json({ token });
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

// Rate limiter
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many requests. Please try again later." },
});

// Reusable transporter (singleton)
let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpHost || !smtpUser || !smtpPass) return null;
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(smtpPort) || 587,
    secure: parseInt(smtpPort) === 465,
    auth: { user: smtpUser, pass: smtpPass },
    pool: true,
  });
  return transporter;
}

app.post("/api/contact", contactLimiter, async (req, res) => {
  const { name, email, message, projectType, timeline, website_url, _ts } = req.body;

  // Honeypot check - silently accept if filled
  if (website_url) {
    return res.json({ success: true, message: "Thank you! Your message has been received." });
  }

  // Timing check - reject if submitted too fast (under 3 seconds)
  if (_ts && (Date.now() - Number(_ts)) < 3000) {
    return res.json({ success: true, message: "Thank you! Your message has been received." });
  }

  // CSRF token check
  const csrfToken = req.body._csrf;
  if (!csrfToken || !csrfTokens.has(csrfToken) || Date.now() > csrfTokens.get(csrfToken)) {
    return res.status(403).json({ error: "Invalid or expired form token. Please refresh and try again." });
  }
  csrfTokens.delete(csrfToken); // one-time use

  if (projectType !== undefined && (typeof projectType !== "string" || projectType.length > 100)) {
    return res.status(400).json({ error: "Invalid project type." });
  }
  if (timeline !== undefined && (typeof timeline !== "string" || timeline.length > 100)) {
    return res.status(400).json({ error: "Invalid timeline." });
  }

  if (!name || !email || !message) {
    return res.status(400).json({ error: "All fields are required." });
  }

  if (typeof name !== "string" || name.length > 100) {
    return res.status(400).json({ error: "Name must be under 100 characters." });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email address." });
  }

  if (message.length > 5000) {
    return res.status(400).json({ error: "Message too long (max 5000 chars)." });
  }

  const contactEmail = process.env.CONTACT_EMAIL;
  const smtp = getTransporter();

  if (!smtp || !contactEmail) {
    console.log("Contact form submission (SMTP not configured):");
    console.log({ name, email, projectType, timeline, message: message.substring(0, 100) });
    return res.json({
      success: true,
      message: "Thank you! Your message has been received.",
    });
  }

  const esc = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
     .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  try {
    await smtp.sendMail({
      from: `"Portfolio Contact" <${process.env.SMTP_USER}>`,
      to: contactEmail,
      replyTo: email,
      subject: `Portfolio Contact: ${name.replace(/[\r\n]/g, "")}`,
      text: `Name: ${name}\nEmail: ${email}\nProject Type: ${projectType || "Not specified"}\nTimeline: ${timeline || "Not specified"}\n\nMessage:\n${message}`,
      html: `
        <h3>New Contact Form Submission</h3>
        <p><strong>Name:</strong> ${esc(name)}</p>
        <p><strong>Email:</strong> ${esc(email)}</p>
        ${projectType ? `<p><strong>Project Type:</strong> ${esc(projectType)}</p>` : ""}
        ${timeline ? `<p><strong>Timeline:</strong> ${esc(timeline)}</p>` : ""}
        <p><strong>Message:</strong></p>
        <p>${esc(message).replace(/\n/g, "<br>")}</p>
      `,
    });

    res.json({ success: true, message: "Thank you! Your message has been sent." });
  } catch (err) {
    console.error("Email send error:", err);
    res.status(500).json({ error: "Failed to send message. Please try again." });
  }
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
