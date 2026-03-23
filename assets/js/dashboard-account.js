(() => {
  "use strict";

  function safeText(value) {
    return String(value || "").trim();
  }

  function escapeHtml(value) {
    return window.BODASecurity?.escapeHtml
      ? window.BODASecurity.escapeHtml(value)
      : safeText(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
  }

  function notify(message, type = "error") {
    const holder = document.getElementById("accountStatus");
    if (!holder) return;
    holder.classList.remove("hidden", "error", "success", "info");
    holder.classList.add("status-note", type);
    holder.textContent = safeText(message);
  }

  function setButtonLoading(button, loadingText, isLoading) {
    if (!button) return;
    if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent || "";
    button.disabled = Boolean(isLoading);
    button.textContent = isLoading ? loadingText : button.dataset.defaultText;
  }

  async function fillPartnerSummary() {
    const email = window.PartnerSession.getCurrentEmail();
    const holder = document.getElementById("partnerSummary");
    if (!holder) return;

    try {
      const partner = await window.PartnerAPI.hasPartnerProfile(email);
      if (!partner.exists || !partner.row) {
        holder.innerHTML = '<p class="muted">لا توجد بيانات شراكة مسجلة.</p>';
        return;
      }

      const row = partner.row;
      holder.innerHTML = `
        <div class="account-grid">
          <div class="account-item">
            <small class="muted">اسم المتجر</small>
            <strong>${escapeHtml(row.store_name || "-")}</strong>
          </div>
          <div class="account-item">
            <small class="muted">حالة الطلب</small>
            <strong>${escapeHtml(row.status || "pending")}</strong>
          </div>
          <div class="account-item">
            <small class="muted">هاتف المتجر</small>
            <strong>${escapeHtml(row.store_phone || "-")}</strong>
          </div>
          <div class="account-item">
            <small class="muted">المدينة</small>
            <strong>${escapeHtml(row.city || "-")}</strong>
          </div>
        </div>
      `;
    } catch (error) {
      console.error("partner summary error", error);
      holder.innerHTML = '<p class="muted">تعذر تحميل بيانات الشراكة.</p>';
    }
  }

  async function initAccountPage() {
    const user = await window.PartnerSession.requireAuth({ requirePartner: true });
    if (!user) return;

    window.PartnerSession.markActiveNav("account");
    document.getElementById("currentUserLabel").textContent = user.email || "";
    document.getElementById("accountName").value = safeText(user.name);
    document.getElementById("accountEmail").value = safeText(user.email);
    document.getElementById("accountPhone").value = safeText(user.phone);

    document.getElementById("logoutBtn")?.addEventListener("click", async () => {
      await window.PartnerSession.signOut();
      window.PartnerSession.goTo(window.APP_ROUTES.login);
    });

    document.getElementById("accountForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();

      const submitBtn = event.currentTarget.querySelector('button[type="submit"]');
      const name = window.BODASecurity?.sanitizeText
        ? window.BODASecurity.sanitizeText(document.getElementById("accountName")?.value, 140)
        : safeText(document.getElementById("accountName")?.value);
      const phone = window.BODASecurity?.sanitizeText
        ? window.BODASecurity.sanitizeText(document.getElementById("accountPhone")?.value, 30)
        : safeText(document.getElementById("accountPhone")?.value);
      const email = window.PartnerSession.getCurrentEmail();

      if (!name) {
        notify("الاسم مطلوب.", "error");
        return;
      }

      setButtonLoading(submitBtn, "جارٍ الحفظ...", true);
      try {
        await window.PartnerAPI.updateMyProfile({ full_name: name, phone });
        await window.PartnerSession.refreshFromAuth();
        notify("تم تحديث بيانات الحساب.", "success");
      } catch (error) {
        console.error("update profile error", error);
        notify("تعذر تحديث بيانات الحساب.", "error");
      } finally {
        setButtonLoading(submitBtn, "", false);
      }
    });

    await fillPartnerSummary();
  }

  document.addEventListener("DOMContentLoaded", initAccountPage);
})();

