(() => {
  "use strict";

  const APP_CONFIG = Object.freeze({
    SUPABASE_URL: "https://msgqzgzoslearaprgiqq.supabase.co",
    SUPABASE_ANON_KEY:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE",
    EMAILJS_PUBLIC_KEY: "aN8diTdM6f4VzJ3m7",
    EMAILJS_SERVICE_ID: "service_0yeuev9",
    EMAILJS_TEMPLATE_ID: "template_ulxjz0r",
    OTP_LENGTH: 6,
    OTP_TTL_MS: 10 * 60 * 1000,
    OTP_RESEND_COOLDOWN_MS: 60 * 1000,
    OTP_MAX_RESENDS: 3,
    LOGIN_MAX_ATTEMPTS: 5,
    LOGIN_LOCK_MS: 5 * 60 * 1000,
  });

  const ROUTES = Object.freeze({
    root: "index.html",
    login: "auth/login.html",
    signup: "auth/signup.html",
    verify: "auth/verify.html",
    partnership: "partnership/form.html",
    dashboardProducts: "dashboard/products.html",
    dashboardOrders: "dashboard/orders.html",
    dashboardAccount: "dashboard/account.html",
  });

  function resolvePortalPath(path) {
    const cleanPath = String(path || "").replace(/^\/+/, "");
    const normalized = String(window.location.pathname || "").replace(/\\/g, "/").toLowerCase();
    const isNested = /\/(auth|partnership|dashboard)\//.test(normalized);
    return isNested ? `../${cleanPath}` : cleanPath;
  }

  window.APP_CONFIG = APP_CONFIG;
  window.APP_ROUTES = ROUTES;
  window.resolvePortalPath = resolvePortalPath;
})();
