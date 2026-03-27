(() => {
  "use strict";

  const PARTNER_CACHE_KEY = "local_partner_profile_v1";
  const PARTNER_SUMMARY_REFRESH_MS = 8000;
  let partnerSummaryTimer = null;

  function safeText(value) {
    return String(value || "").trim();
  }

  function escapeHtml(value) {
    return window.BudaSecurity?.escapeHtml
      ? window.BudaSecurity.escapeHtml(value)
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

  function formatPartnerStatus(value) {
    const raw = safeText(value);
    const key = raw.toLowerCase().replace(/\s+/g, "_");

    if (!key) return "قيد الانتظار";

    if (key.includes("in_progress") || key.includes("under_review") || key.includes("processing")) {
      return "تحت التنفيذ";
    }
    if (key.includes("pending")) return "قيد الانتظار";
    if (key.includes("approved")) return "تم القبول";
    if (key.includes("rejected")) return "مرفوض";

    if (key.includes("تنفيذ")) return "تحت التنفيذ";
    if (key.includes("قيد")) return "قيد الانتظار";
    if (key.includes("قبول")) return "تم القبول";
    if (key.includes("رفض")) return "مرفوض";

    return raw;
  }

  function clearPartnerCache() {
    try {
      localStorage.removeItem(PARTNER_CACHE_KEY);
    } catch {
      // Ignore storage read/write failures.
    }
  }

  async function fillPartnerSummary(options = {}) {
    const { forceFresh = false } = options;
    const email = window.PartnerSession.getCurrentEmail();
    const holder = document.getElementById("partnerSummary");
    if (!holder) return;

    if (forceFresh) {
      clearPartnerCache();
    }

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
            <strong>${escapeHtml(formatPartnerStatus(row.status || "pending"))}</strong>
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

  function startPartnerSummaryRefresh() {
    if (partnerSummaryTimer) {
      window.clearInterval(partnerSummaryTimer);
      partnerSummaryTimer = null;
    }

    partnerSummaryTimer = window.setInterval(() => {
      fillPartnerSummary({ forceFresh: true });
    }, PARTNER_SUMMARY_REFRESH_MS);
  }

  function stopPartnerSummaryRefresh() {
    if (!partnerSummaryTimer) return;
    window.clearInterval(partnerSummaryTimer);
    partnerSummaryTimer = null;
  }

  async function initAccountPage() {
    const user = await window.PartnerSession.requireAuth({ requirePartner: true });
    if (!user) return;

    window.PartnerSession.markActiveNav("account");
    window.DashboardTopbarMenu?.mount?.({
      user,
      notify,
    });

    document.getElementById("accountName").value = safeText(user.name);
    document.getElementById("accountEmail").value = safeText(user.email);
    document.getElementById("accountPhone").value = safeText(user.phone);

    document.getElementById("accountForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();

      const submitBtn = event.currentTarget.querySelector('button[type="submit"]');
      const name = window.BudaSecurity?.sanitizeText
        ? window.BudaSecurity.sanitizeText(document.getElementById("accountName")?.value, 140)
        : safeText(document.getElementById("accountName")?.value);
      const phone = window.BudaSecurity?.sanitizeText
        ? window.BudaSecurity.sanitizeText(document.getElementById("accountPhone")?.value, 30)
        : safeText(document.getElementById("accountPhone")?.value);

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

    await fillPartnerSummary({ forceFresh: true });
    startPartnerSummaryRefresh();

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        fillPartnerSummary({ forceFresh: true });
      }
    });

    window.addEventListener(
      "beforeunload",
      () => {
        stopPartnerSummaryRefresh();
      },
      { once: true }
    );
  }

  document.addEventListener("DOMContentLoaded", initAccountPage);
})();
