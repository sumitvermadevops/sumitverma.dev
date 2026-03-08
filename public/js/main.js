/* ============================================================
   main.js — Dark Authority Portfolio
   Normal scrolling page with IntersectionObserver reveals.
   ============================================================ */

/* --- 1. Copyright year + form timestamp --- */
const yearEl = document.getElementById("currentYear");
const tsEl = document.getElementById("formTimestamp");
if (yearEl) yearEl.textContent = new Date().getFullYear();
if (tsEl) tsEl.value = Date.now();

/* --- 2. IntersectionObserver for scroll reveals --- */
const revealObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.15, rootMargin: "0px 0px -50px 0px" });

if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.querySelectorAll(".reveal").forEach(el => revealObserver.observe(el));
} else {
  document.querySelectorAll(".reveal").forEach(el => el.classList.add("is-visible"));
}

/* --- 3. Navigation — sentinel for glass effect --- */
const nav = document.getElementById("nav");
const navSentinel = document.getElementById("nav-sentinel");
if (nav && navSentinel) {
  const navObserver = new IntersectionObserver(([entry]) => {
    nav.classList.toggle("scrolled", !entry.isIntersecting);
  }, { threshold: 0 });
  navObserver.observe(navSentinel);
}

/* --- 4. Scroll-spy for active section --- */
const sections = document.querySelectorAll("section[id]");
const navLinksAll = document.querySelectorAll(".nav__links a");

const spyObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const id = entry.target.id;
      navLinksAll.forEach(link => {
        link.classList.toggle("active", link.getAttribute("href") === "#" + id);
        if (link.getAttribute("href") === "#" + id) {
          link.setAttribute("aria-current", "page");
        } else {
          link.removeAttribute("aria-current");
        }
      });
    }
  });
}, { threshold: 0.3, rootMargin: "-80px 0px -50% 0px" });

sections.forEach(section => spyObserver.observe(section));

/* --- 5. Mobile navigation toggle --- */
const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");

if (navToggle && navLinks) {
  function closeMobileNav() {
    navLinks.classList.remove("active");
    navToggle.classList.remove("active");
    navToggle.setAttribute("aria-expanded", "false");
  }

  function openMobileNav() {
    navLinks.classList.add("active");
    navToggle.classList.add("active");
    navToggle.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => {
      const firstLink = navLinks.querySelector("a");
      if (firstLink) firstLink.focus();
    });
  }

  navToggle.addEventListener("click", () => {
    navLinks.classList.contains("active") ? closeMobileNav() : openMobileNav();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && navLinks.classList.contains("active")) {
      closeMobileNav();
      navToggle.focus();
    }
  });

  navLinks.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || !navLinks.classList.contains("active")) return;
    const focusable = navLinks.querySelectorAll("a");
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  document.querySelectorAll(".nav__links a").forEach(link => {
    link.addEventListener("click", closeMobileNav);
  });
}

/* --- 5b. Theme Toggle (dark/light) --- */
const themeToggle = document.getElementById("themeToggle");
if (themeToggle) {
  const stored = localStorage.getItem("theme");
  if (stored) {
    document.documentElement.setAttribute("data-theme", stored);
  }

  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  });
}

/* --- 5c. Back to Top Button --- */
const backToTop = document.getElementById("backToTop");
if (backToTop) {
  window.addEventListener("scroll", () => {
    backToTop.classList.toggle("visible", window.scrollY > 600);
  }, { passive: true });

  backToTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

/* --- 5d. Cursor Glow Effect --- */
const cursorGlow = document.getElementById("cursorGlow");
if (cursorGlow && !window.matchMedia("(pointer: coarse)").matches
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  let glowX = 0, glowY = 0, currentX = 0, currentY = 0;
  let animating = false;

  document.addEventListener("mousemove", (e) => {
    glowX = e.clientX;
    glowY = e.clientY;
    if (!cursorGlow.classList.contains("active")) {
      cursorGlow.classList.add("active");
    }
    if (!animating) {
      animating = true;
      requestAnimationFrame(function moveGlow() {
        currentX += (glowX - currentX) * 0.15;
        currentY += (glowY - currentY) * 0.15;
        cursorGlow.style.left = currentX + "px";
        cursorGlow.style.top = currentY + "px";
        if (Math.abs(glowX - currentX) > 0.5 || Math.abs(glowY - currentY) > 0.5) {
          requestAnimationFrame(moveGlow);
        } else {
          animating = false;
        }
      });
    }
  });

  document.addEventListener("mouseleave", () => {
    cursorGlow.classList.remove("active");
  });
}

/* --- 5e. Animated Impact Counters --- */
const counterObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      animateCounters(entry.target);
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });

const impactGrid = document.querySelector(".impact__grid");
if (impactGrid && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  counterObserver.observe(impactGrid);
}

function animateCounters(container) {
  const numbers = container.querySelectorAll(".impact__number[data-count]");
  numbers.forEach(el => {
    const target = parseFloat(el.dataset.count);
    const prefix = el.dataset.prefix || "";
    const suffix = el.dataset.suffix || "";
    const decimals = parseInt(el.dataset.decimals) || 0;
    const separator = el.dataset.separator || "";
    const duration = 1800;
    const start = performance.now();

    function easeOutQuart(t) {
      return 1 - Math.pow(1 - t, 4);
    }

    function formatNumber(num) {
      const fixed = num.toFixed(decimals);
      if (separator) {
        const parts = fixed.split(".");
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, separator);
        return parts.join(".");
      }
      return fixed;
    }

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutQuart(progress);
      const current = eased * target;
      el.textContent = prefix + formatNumber(current) + suffix;
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }

    el.textContent = prefix + formatNumber(0) + suffix;
    requestAnimationFrame(tick);
  });
}

/* --- 6. CSRF Token — Promise-based (handles 15-min expiry) --- */
let csrfTokenPromise = fetch("/api/csrf")
  .then(r => r.json())
  .then(d => d.token)
  .catch(() => "");

let csrfRefreshTimeout = null;
document.querySelectorAll("#contactForm input, #contactForm textarea, #contactForm select").forEach(field => {
  field.addEventListener("focus", () => {
    if (csrfRefreshTimeout) clearTimeout(csrfRefreshTimeout);
    csrfRefreshTimeout = setTimeout(() => {
      csrfTokenPromise = fetch("/api/csrf").then(r => r.json()).then(d => d.token).catch(() => "");
    }, 300);
  }, { once: false });
});

/* --- 7. Contact form submission --- */
const contactForm = document.getElementById("contactForm");
const formStatus = document.getElementById("formStatus");
const submitBtn = document.getElementById("submitBtn");
let activeSubmitController = null;

if (contactForm) contactForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (activeSubmitController) activeSubmitController.abort();

  const controller = new AbortController();
  activeSubmitController = controller;
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  submitBtn.disabled = true;
  submitBtn.textContent = "Sending...";
  formStatus.textContent = "";
  formStatus.className = "form-status";

  let csrfToken;
  try {
    csrfToken = await csrfTokenPromise;
  } catch {
    formStatus.textContent = "Could not verify session. Please reload.";
    formStatus.classList.add("error");
    submitBtn.disabled = false;
    submitBtn.textContent = "Send Message";
    activeSubmitController = null;
    return;
  }

  const data = {
    name: document.getElementById("name").value.trim(),
    email: document.getElementById("email").value.trim(),
    message: document.getElementById("message").value.trim(),
    projectType: document.getElementById("projectType").value,
    timeline: document.getElementById("timeline").value,
    website_url: document.getElementById("website_url").value,
    _ts: document.getElementById("formTimestamp").value,
    _csrf: csrfToken,
  };

  try {
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (controller !== activeSubmitController) return;
    const result = await res.json();

    if (res.ok && result.success) {
      formStatus.textContent = result.message;
      formStatus.classList.add("success");
      contactForm.reset();
      document.getElementById("formTimestamp").value = Date.now();
      csrfTokenPromise = fetch("/api/csrf").then(r => r.json()).then(d => d.token).catch(() => "");
    } else {
      formStatus.textContent = result.error || "Something went wrong.";
      formStatus.classList.add("error");
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (controller !== activeSubmitController) return;
    formStatus.textContent = err.name === "AbortError"
      ? "Request timed out. Please try again."
      : "Network error. Please try again.";
    formStatus.classList.add("error");
  } finally {
    if (controller === activeSubmitController) {
      activeSubmitController = null;
      submitBtn.disabled = false;
      submitBtn.textContent = "Send Message";
    }
  }
});

/* --- 8. Blog posts from Substack RSS --- */
function showBlogFallback() {
  const container = document.getElementById("blogPosts");
  const fallback = document.getElementById("blogFallback");
  while (container.firstChild) container.removeChild(container.firstChild);
  fallback.classList.remove("hidden");
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function createBlogCard(post) {
  const date = new Date(post.date);
  const formatted = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const card = document.createElement("a");
  card.href = post.link;
  card.target = "_blank";
  card.rel = "noopener noreferrer";
  card.className = "blog-card reveal";

  const dateSpan = document.createElement("span");
  dateSpan.className = "blog-card__date mono";
  dateSpan.textContent = formatted;

  const title = document.createElement("h3");
  title.className = "blog-card__title";
  title.textContent = post.title;

  const excerpt = document.createElement("p");
  excerpt.className = "blog-card__excerpt";
  excerpt.textContent = post.excerpt;

  const readLink = document.createElement("span");
  readLink.className = "blog-card__read";
  readLink.textContent = "Read on Substack \u2192";

  card.append(dateSpan, title, excerpt, readLink);
  return card;
}

(async () => {
  try {
    const res = await fetch("/api/blog");
    if (!res.ok) throw new Error("Blog API error");
    const posts = await res.json();
    if (posts.length > 0) {
      const container = document.getElementById("blogPosts");
      const fallback = document.getElementById("blogFallback");
      const moreBtn = document.getElementById("blogMoreBtn");

      while (container.firstChild) container.removeChild(container.firstChild);

      posts.forEach(post => {
        const card = createBlogCard(post);
        container.appendChild(card);
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          revealObserver.observe(card);
        } else {
          card.classList.add("is-visible");
        }
      });

      fallback.classList.add("hidden");
      moreBtn.classList.remove("hidden");
    } else {
      showBlogFallback();
    }
  } catch (err) {
    console.warn("Blog fetch failed:", err);
    showBlogFallback();
  }
})();

/* --- 9. Cert verification links from Credly --- */
(async () => {
  try {
    const res = await fetch("/api/certs");
    if (!res.ok) return;
    const certs = await res.json();
    document.querySelectorAll(".cert-badge[data-cert]").forEach(badge => {
      const url = certs[badge.dataset.cert];
      if (url) {
        badge.classList.add("cert-linked");
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener";
        const imgEl = badge.querySelector("img");
        a.setAttribute("aria-label", (imgEl ? imgEl.alt : badge.dataset.cert) + " \u2014 Verify on Credly");
        while (badge.firstChild) a.appendChild(badge.firstChild);
        badge.appendChild(a);
      }
    });
  } catch {
    // Cert links are optional — fail silently
  }
})();

/* --- 10. Email copy-on-click --- */
const copyEmailBtn = document.getElementById("copyEmail");
if (copyEmailBtn) {
  copyEmailBtn.addEventListener("click", async () => {
    const email = copyEmailBtn.dataset.email;
    try {
      await navigator.clipboard.writeText(email);
      const span = copyEmailBtn.querySelector("span");
      const original = span.textContent;
      span.textContent = "Copied!";
      setTimeout(() => { span.textContent = original; }, 2000);
    } catch {
      window.location.href = "mailto:" + email;
    }
  });
}
