(() => {
  "use strict";

  async function handleLogout() {
    try {
      await window.PartnerSession.signOut();
    } finally {
      window.PartnerSession.goTo(window.APP_ROUTES.login);
    }
  }

  async function initBlockedPage() {
    const user = await window.PartnerSession.requireAuth({
      requirePartner: true,
      allowRejected: true,
    });
    if (!user) return;

    const access = await window.PartnerSession.getPartnerAccess(user, { forceFresh: true });
    if (!access.exists) {
      window.PartnerSession.goTo(window.APP_ROUTES.partnership);
      return;
    }

    if (access.normalizedStatus !== "rejected") {
      window.PartnerSession.goTo(window.APP_ROUTES.dashboardProducts);
      return;
    }

    document.getElementById("blockedLogoutBtn")?.addEventListener("click", handleLogout);
  }

  document.addEventListener("DOMContentLoaded", initBlockedPage);
})();
