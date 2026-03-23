(() => {
  "use strict";

  function safeText(value) {
    return String(value || "").trim();
  }

  function sanitizeField(value, maxLength = 200) {
    if (window.BODASecurity?.sanitizeText) {
      return window.BODASecurity.sanitizeText(value, maxLength);
    }
    return safeText(value).slice(0, maxLength);
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

  function normalizeEmail(value) {
    return window.BODASecurity?.normalizeEmail
      ? window.BODASecurity.normalizeEmail(value)
      : safeText(value).toLowerCase();
  }

  function notify(message, type = "error") {
    const holder = document.getElementById("partnerStatus");
    if (!holder) return;
    holder.classList.remove("hidden", "error", "success", "info");
    holder.classList.add("status-note", type);
    holder.textContent = safeText(message);
  }

  function clearNotify() {
    const holder = document.getElementById("partnerStatus");
    if (!holder) return;
    holder.classList.add("hidden");
    holder.textContent = "";
    holder.classList.remove("error", "success", "info");
  }

  function setButtonLoading(button, loadingText, isLoading) {
    if (!button) return;
    if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent || "";
    button.disabled = Boolean(isLoading);
    button.textContent = isLoading ? loadingText : button.dataset.defaultText;
  }

  function formValue(id) {
    const longTextFields = new Set(["description", "address"]);
    const maxLength = longTextFields.has(id) ? 1000 : 200;
    return sanitizeField(document.getElementById(id)?.value, maxLength);
  }

  function validatePayload(payload) {
    const requiredFields = [
      "owner_name",
      "owner_email",
      "owner_phone",
      "national_id",
      "store_name",
      "store_category",
      "description",
      "country",
      "city",
      "address",
      "store_phone",
    ];

    for (const key of requiredFields) {
      if (!safeText(payload[key])) {
        return `الرجاء تعبئة الحقل: ${key.replaceAll("_", " ")}`;
      }
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.owner_email)) {
      return "البريد الإلكتروني غير صحيح.";
    }

    if (!/^(010|011|012|015)\d{8}$/.test(payload.owner_phone)) {
      return "رقم هاتف المالك غير صحيح.";
    }

    if (!/^(010|011|012|015)\d{8}$/.test(payload.store_phone)) {
      return "رقم هاتف المتجر غير صحيح.";
    }

    if (!/^\d{14}$/.test(payload.national_id)) {
      return "الرقم القومي يجب أن يكون 14 رقمًا.";
    }

    return "";
  }

  async function initPartnershipPage() {
    const user = await window.PartnerSession.requireAuth({ requirePartner: false });
    if (!user) return;

    const currentUser = user;
    try {
      const existing = await window.PartnerAPI.hasPartnerProfile(currentUser);
      if (existing.exists) {
        const existingBox = document.getElementById("existingPartnerBox");
        const existingText = document.getElementById("existingPartnerText");
        const formCard = document.getElementById("partnerFormCard");
        if (existingText) {
          const storeName = existing?.row?.store_name || "متجرك";
          const status = existing?.row?.status || "pending";
          existingText.innerHTML =
            `تم العثور على طلب سابق باسم <strong>${escapeHtml(storeName)}</strong> وحالته <strong>${escapeHtml(
              status
            )}</strong>.`;
        }
        existingBox?.classList.remove("hidden");
        formCard?.classList.add("hidden");
        document.getElementById("openDashboardBtn")?.addEventListener("click", () => {
          window.PartnerSession.goTo(window.APP_ROUTES.dashboardProducts);
        });
        return;
      }
    } catch (error) {
      console.warn("partner profile pre-check failed", error);
    }

    if (document.getElementById("owner_email")) {
      document.getElementById("owner_email").value = currentUser.email;
      document.getElementById("owner_email").setAttribute("readonly", "readonly");
    }
    if (document.getElementById("owner_name")) {
      document.getElementById("owner_name").value = safeText(user.name);
    }
    if (document.getElementById("owner_phone")) {
      document.getElementById("owner_phone").value = safeText(user.phone);
    }

    const form = document.getElementById("partnerForm");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearNotify();

      const submitBtn = form.querySelector('button[type="submit"]');
      const payload = {
        owner_name: formValue("owner_name"),
        owner_email: normalizeEmail(formValue("owner_email")),
        owner_phone: formValue("owner_phone"),
        national_id: formValue("national_id"),
        store_name: formValue("store_name"),
        store_category: formValue("store_category"),
        description: formValue("description"),
        country: formValue("country"),
        city: formValue("city"),
        address: formValue("address"),
        store_phone: formValue("store_phone"),
        status: "pending",
      };

      const validationError = validatePayload(payload);
      if (validationError) {
        notify(validationError, "error");
        return;
      }

      if (payload.owner_email !== currentUser.email) {
        notify("غير مسموح بتغيير البريد المرتبط بالحساب.", "error");
        return;
      }

      setButtonLoading(submitBtn, "جارٍ إرسال الطلب...", true);
      try {
        const result = await window.PartnerAPI.savePartnerRequest(payload, currentUser);
        if (result.exists) {
          notify("بيانات الشراكة مسجلة مسبقًا. جارٍ فتح لوحة الشريك.", "info");
        } else {
          notify("تم إرسال بيانات الشراكة بنجاح.", "success");
        }
        setTimeout(() => window.PartnerSession.goTo(window.APP_ROUTES.dashboardProducts), 700);
      } catch (error) {
        console.error("save partner request error", error);
        notify("تعذر إرسال بيانات الشراكة الآن.", "error");
      } finally {
        setButtonLoading(submitBtn, "", false);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", initPartnershipPage);
})();
