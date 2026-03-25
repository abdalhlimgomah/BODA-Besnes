(() => {
  "use strict";

  const SESSION_KEYS = Object.freeze({
    currentUser: "currentUser",
    loggedIn: "isLoggedIn",
    userEmail: "userEmail",
    userFullName: "userFullName",
    userPhone: "userPhone",
    authSource: "authSource",
  });
  const LOCAL_PARTNER_PROFILE_KEY = "local_partner_profile_v1";
  const LOCAL_DIRECT_ACCOUNT_KEY = "local_direct_account_v1";
  const LOCAL_DIRECT_SIGNOUT_FLAG_KEY = "local_direct_signout_v1";
  const DIRECT_LOCAL_ACCOUNTS = Object.freeze([
    Object.freeze({
      id: "local-boda-test",
      name: "Buda_TEST_ACCOUNT",
      email: "test.partner@boda.local",
    }),
    Object.freeze({
      id: "local-admen788",
      name: "admen788BOmen",
      email: "admen788BOmen@gmail.com",
    }),
  ]);

  const runtime = {
    authListenerAttached: false,
  };

  function readJSON(raw) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function normalizeEmail(email) {
    return window.BudaSecurity?.normalizeEmail
      ? window.BudaSecurity.normalizeEmail(email)
      : String(email || "").trim().toLowerCase();
  }

  function safeText(value) {
    return String(value || "").trim();
  }

  function findDirectLocalAccountByEmail(email) {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail) return null;
    return DIRECT_LOCAL_ACCOUNTS.find((account) => normalizeEmail(account.email) === cleanEmail) || null;
  }

  function isDirectLocalEmail(email) {
    return Boolean(findDirectLocalAccountByEmail(email));
  }

  function isDirectFallbackBlocked() {
    return localStorage.getItem(LOCAL_DIRECT_SIGNOUT_FLAG_KEY) === "1";
  }

  function setDirectFallbackBlocked(blocked) {
    if (blocked) {
      localStorage.setItem(LOCAL_DIRECT_SIGNOUT_FLAG_KEY, "1");
      return;
    }
    localStorage.removeItem(LOCAL_DIRECT_SIGNOUT_FLAG_KEY);
  }

  function getDirectLocalFallbackUser() {
    if (isDirectFallbackBlocked()) return null;

    const row = readJSON(localStorage.getItem(LOCAL_DIRECT_ACCOUNT_KEY));
    if (!row || typeof row !== "object") return null;

    const email = normalizeEmail(row.email || "");
    const account = findDirectLocalAccountByEmail(email);
    if (!email || !account) return null;

    return {
      id: safeText(row.id || account.id || "local-direct"),
      email,
      name: safeText(row.name || account.name || "Local Test User"),
      phone: safeText(row.phone || ""),
      authSource: "local",
      loginTime: safeText(row.updatedAt || row.createdAt || new Date().toISOString()),
    };
  }

  function getCurrentUser() {
    const parsed = readJSON(localStorage.getItem(SESSION_KEYS.currentUser));
    if (parsed && parsed.email) {
      const parsedUser = {
        id: safeText(parsed.id || ""),
        email: normalizeEmail(parsed.email || ""),
        name: safeText(parsed.name || parsed.full_name || ""),
        phone: safeText(parsed.phone || ""),
        authSource: safeText(parsed.authSource || parsed.auth_source || ""),
        loginTime: safeText(parsed.loginTime || new Date().toISOString()),
      };

      if (isDirectLocalEmail(parsedUser.email) && !safeText(parsedUser.authSource)) {
        parsedUser.authSource = "local";
      }

      return parsedUser.email ? parsedUser : null;
    }

    const email = normalizeEmail(localStorage.getItem(SESSION_KEYS.userEmail));
    if (!email) {
      return getDirectLocalFallbackUser();
    }

    const legacy = {
      id: safeText(localStorage.getItem("userId") || ""),
      email,
      name: safeText(localStorage.getItem(SESSION_KEYS.userFullName) || ""),
      phone: safeText(localStorage.getItem(SESSION_KEYS.userPhone) || ""),
      authSource: safeText(localStorage.getItem(SESSION_KEYS.authSource) || ""),
      loginTime: new Date().toISOString(),
    };
    if (isDirectLocalEmail(legacy.email) && !safeText(legacy.authSource)) {
      legacy.authSource = "local";
    }
    return legacy;
  }

  function setCurrentUser(user) {
    const normalized = {
      id: safeText(user?.id || ""),
      email: normalizeEmail(user?.email || ""),
      name: safeText(user?.name || user?.full_name || ""),
      phone: safeText(user?.phone || ""),
      authSource: safeText(user?.authSource || user?.auth_source || ""),
      loginTime: safeText(user?.loginTime || new Date().toISOString()),
    };

    if (!normalized.email) return false;

    localStorage.setItem(SESSION_KEYS.currentUser, JSON.stringify(normalized));
    localStorage.setItem(SESSION_KEYS.loggedIn, "true");
    localStorage.setItem(SESSION_KEYS.userEmail, normalized.email);
    localStorage.setItem(SESSION_KEYS.userFullName, normalized.name);
    localStorage.setItem(SESSION_KEYS.userPhone, normalized.phone);
    localStorage.setItem(SESSION_KEYS.authSource, normalized.authSource);
    localStorage.setItem("userId", normalized.id);

    if (isDirectLocalEmail(normalized.email)) {
      setDirectFallbackBlocked(false);
    }

    return true;
  }

  function clearSession() {
    Object.values(SESSION_KEYS).forEach((key) => localStorage.removeItem(key));
    localStorage.removeItem("userId");
  }

  function isLocalAuthUser(user) {
    const source = safeText(user?.authSource || "").toLowerCase();
    const email = normalizeEmail(user?.email || "");
    return source === "local" || isDirectLocalEmail(email);
  }

  function hasLocalPartnerProfile(email) {
    const row = readJSON(localStorage.getItem(LOCAL_PARTNER_PROFILE_KEY));
    if (!row || !email) return false;
    const rowEmail = normalizeEmail(row.owner_email || row.email || "");
    return Boolean(rowEmail && rowEmail === normalizeEmail(email));
  }

  function isRecentLogin(user, maxAgeMs = 2 * 60 * 1000) {
    const stamp = Date.parse(safeText(user?.loginTime || ""));
    if (!stamp) return false;
    return Date.now() - stamp <= maxAgeMs;
  }

  async function refreshFromAuth() {
    const cached = getCurrentUser();
    if (cached && isLocalAuthUser(cached)) {
      if (localStorage.getItem(SESSION_KEYS.loggedIn) !== "true") {
        setCurrentUser({ ...cached, authSource: "local" });
      }
      return cached;
    }

    const directFallback = getDirectLocalFallbackUser();
    if (directFallback) {
      setCurrentUser(directFallback);
      return directFallback;
    }

    if (!window.PartnerAPI) {
      return cached || null;
    }

    try {
      let authUser = await window.PartnerAPI.getAuthUser();
      if (!authUser && window.PartnerAPI.getAuthSession) {
        try {
          const session = await window.PartnerAPI.getAuthSession();
          authUser = session?.user || null;
        } catch {
          authUser = null;
        }
      }

      if (!authUser) {
        if (directFallback) {
          setCurrentUser(directFallback);
          return directFallback;
        }
        if (cached && isRecentLogin(cached)) {
          return cached;
        }
        clearSession();
        return null;
      }

      let profile = null;
      try {
        profile = await window.PartnerAPI.getMyProfile();
      } catch (error) {
        console.warn("profile fetch skipped", error);
      }

      const metadata = authUser.user_metadata || {};
      const normalized = {
        id: authUser.id,
        email: normalizeEmail(authUser.email || profile?.email || ""),
        name: safeText(profile?.full_name || metadata.full_name || ""),
        phone: safeText(profile?.phone || metadata.phone || ""),
      };

      if (!normalized.email) {
        clearSession();
        return null;
      }

      setCurrentUser(normalized);
      return getCurrentUser();
    } catch (error) {
      console.error("refresh auth session failed", error);
      if (cached && isRecentLogin(cached)) {
        return cached;
      }
      clearSession();
      return null;
    }
  }

  function getCurrentEmail() {
    const user = getCurrentUser();
    return normalizeEmail(user?.email || "");
  }

  function isAuthenticated() {
    return localStorage.getItem(SESSION_KEYS.loggedIn) === "true" && Boolean(getCurrentEmail());
  }

  function safeNextPath(rawNext) {
    const value = String(rawNext || "").trim();
    if (!value) return "";
    if (value.includes("://") || value.startsWith("//")) return "";
    if (value.startsWith("javascript:")) return "";
    return value.replace(/^\/+/, "");
  }

  function goTo(route, query = {}) {
    const base = window.resolvePortalPath ? window.resolvePortalPath(route) : route;
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      const text = String(value || "").trim();
      if (text) params.set(key, text);
    });
    const queryString = params.toString();
    window.location.href = queryString ? `${base}?${queryString}` : base;
  }

  async function redirectAfterAuth() {
    const user = await refreshFromAuth();
    if (!user) {
      goTo(window.APP_ROUTES.login);
      return;
    }

    if (isDirectLocalEmail(user.email)) {
      goTo(window.APP_ROUTES.dashboardProducts);
      return;
    }

    // Requested flow: login -> partnership page first.
    goTo(window.APP_ROUTES.partnership);
  }

  async function requireAuth(options = {}) {
    const requirePartner = Boolean(options.requirePartner);
    const fallbackRoute = options.fallbackRoute || window.APP_ROUTES.login;

    const currentPath = String(window.location.pathname || "").split("/").pop() || "";
    const user = await refreshFromAuth();

    if (!user) {
      goTo(fallbackRoute, { next: safeNextPath(currentPath) });
      return null;
    }

    if (!requirePartner) return user;

    if (isLocalAuthUser(user)) {
      if (isDirectLocalEmail(user.email)) return user;
      if (hasLocalPartnerProfile(user.email)) return user;
      goTo(window.APP_ROUTES.partnership);
      return null;
    }

    try {
      const partner = await window.PartnerAPI.hasPartnerProfile(user);
      if (!partner.exists) {
        goTo(window.APP_ROUTES.partnership);
        return null;
      }
    } catch {
      goTo(window.APP_ROUTES.partnership);
      return null;
    }

    return user;
  }

  async function signOut() {
    try {
      await window.PartnerAPI?.authSignOut?.();
    } catch (error) {
      console.warn("sign out failed", error);
    } finally {
      setDirectFallbackBlocked(true);
      clearSession();
    }
  }

  function markActiveNav(target) {
    document.querySelectorAll("[data-nav]").forEach((link) => {
      const isActive = link.getAttribute("data-nav") === target;
      link.classList.toggle("active", isActive);
    });
  }

  function attachAuthStateListener() {
    if (runtime.authListenerAttached || !window.PartnerAPI?.onAuthStateChange) return;

    const existing = getCurrentUser() || getDirectLocalFallbackUser();
    if (isDirectLocalEmail(existing?.email || "")) return;

    try {
      window.PartnerAPI.onAuthStateChange((event, session) => {
        const current = getCurrentUser();
        const localUserActive = isLocalAuthUser(current);

        if (event === "SIGNED_OUT") {
          if (!localUserActive) clearSession();
          return;
        }

        // تجاهل الأحداث المؤقتة التي تأتي بدون session لتفادي حلقة الرجوع للّوجن.
        if (!session) return;
        if (localUserActive) return;
        refreshFromAuth();
      });
      runtime.authListenerAttached = true;
    } catch (error) {
      console.warn("auth listener attach failed", error);
    }
  }

  attachAuthStateListener();

  window.PartnerSession = Object.freeze({
    keys: SESSION_KEYS,
    getCurrentUser,
    getCurrentEmail,
    isAuthenticated,
    setCurrentUser,
    clearSession,
    refreshFromAuth,
    signOut,
    goTo,
    redirectAfterAuth,
    requireAuth,
    markActiveNav,
  });
})();
