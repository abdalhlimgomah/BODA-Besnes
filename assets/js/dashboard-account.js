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

  function qs(id) { return document.getElementById(id); }

  function notify(message, type) {
    const holder = qs("accountStatus");
    if (!holder) return;
    holder.classList.remove("hidden", "error", "success", "info");
    holder.classList.add("status-note", type || "info");
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
    if (key.includes("in_progress") || key.includes("under_review") || key.includes("processing")) return "تحت التنفيذ";
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
    try { localStorage.removeItem(PARTNER_CACHE_KEY); } catch { }
  }

  function updateProfileHeader(user) {
    var nameEl = qs("profileName");
    var emailEl = qs("profileEmail");
    var avatarImg = qs("profileAvatarImage");
    var avatarFallback = qs("profileAvatarFallback");
    var avatarWrap = qs("profileAvatar");
    if (nameEl) nameEl.textContent = user.name || user.email || "-";
    if (emailEl) emailEl.textContent = user.email || "-";

    var avatarUrl = user.avatarUrl || user.avatar_url || "";
    if (avatarUrl && avatarUrl.length > 20) {
      avatarImg.src = avatarUrl;
      avatarImg.classList.remove("hidden");
      avatarFallback.style.display = "none";
    } else {
      avatarImg.classList.add("hidden");
      avatarImg.src = "";
      avatarFallback.style.display = "flex";
      avatarFallback.textContent = (user.name || user.email || "?")[0].toUpperCase();
    }
  }

  async function uploadAvatarToStorage(file, email) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function(e) {
        var img = new Image();
        img.onload = function() {
          var canvas = document.createElement("canvas");
          var maxDim = 800;
          var w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            var ratio = Math.min(maxDim / w, maxDim / h);
            w = Math.round(w * ratio); h = Math.round(h * ratio);
          }
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob(function(blob) {
            if (!blob) { reject(new Error("فشل تحويل الصورة")); return; }
            var ext = "jpg";
            var fileName = "avatar_" + encodeURIComponent(email) + "_" + Date.now() + "." + ext;
            var storageClient = window.PartnerAPI && window.PartnerAPI.raw && window.PartnerAPI.raw().storage;
            if (!storageClient) {
              var dataUrl = canvas.toDataURL("image/jpeg", 0.8);
              resolve(dataUrl);
              return;
            }
            storageClient.from("receipts").upload(fileName, blob, {
              contentType: "image/jpeg",
              cacheControl: "31536000",
              upsert: true
            }).then(function(res) {
              if (res.error) {
                var dataUrl = canvas.toDataURL("image/jpeg", 0.8);
                resolve(dataUrl);
                return;
              }
              var publicUrl = storageClient.from("receipts").getPublicUrl(fileName).data.publicUrl;
              resolve(publicUrl);
            }).catch(function() {
              var dataUrl = canvas.toDataURL("image/jpeg", 0.8);
              resolve(dataUrl);
            });
          }, "image/jpeg", 0.8);
        };
        img.onerror = function() { reject(new Error("فشل قراءة الصورة")); };
        img.src = e.target.result;
      };
      reader.onerror = function() { reject(new Error("فشل قراءة الملف")); };
      reader.readAsDataURL(file);
    });
  }

  function initAvatarUpload(user) {
    var avatarEl = qs("profileAvatar");
    var overlayEl = qs("profileAvatarOverlay");
    var inputEl = qs("profileAvatarInput");
    if (!inputEl || !avatarEl) return;

    function triggerPicker() { inputEl.click(); }
    avatarEl.addEventListener("click", triggerPicker);
    if (overlayEl) overlayEl.addEventListener("click", function(e) { e.stopPropagation(); triggerPicker(); });

    inputEl.addEventListener("change", async function() {
      var file = inputEl.files && inputEl.files[0];
      inputEl.value = "";
      if (!file) return;

      notify("جاري رفع الصورة...", "info");
      try {
        var url = await uploadAvatarToStorage(file, user.email);
        await window.PartnerAPI.updateMyProfile({ avatar_url: url });
        var refreshed = await window.PartnerSession.refreshFromAuth();
        if (refreshed) {
          user = refreshed;
          user.email = user.email || user.email;
        } else {
          user.avatarUrl = url;
        }
        updateProfileHeader(user);
        notify("✅ تم تحديث الصورة", "success");
      } catch (err) {
        notify("خطأ: " + err.message, "error");
      }
    });
  }

  async function fillPartnerSummary(options) {
    const { forceFresh = false } = options || {};
    const email = window.PartnerSession.getCurrentEmail();
    const holder = qs("partnerSummary");
    if (!holder) return;

    if (forceFresh) clearPartnerCache();

    try {
      const partner = await window.PartnerAPI.hasPartnerProfile(email);
      if (!partner.exists || !partner.row) {
        holder.innerHTML = '<p class="muted">لا توجد بيانات شراكة مسجلة.</p>';
        return;
      }

      const row = partner.row;
      var statusText = formatPartnerStatus(row.status || "pending");
      var badgeEl = qs("profileStatusBadge");
      if (badgeEl) badgeEl.textContent = statusText;

      holder.innerHTML = `
        <div class="account-grid">
          <div class="account-item">
            <small class="muted">اسم المتجر</small>
            <strong>${escapeHtml(row.store_name || "-")}</strong>
          </div>
          <div class="account-item">
            <small class="muted">حالة الطلب</small>
            <strong>${escapeHtml(statusText)}</strong>
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
    if (partnerSummaryTimer) { clearInterval(partnerSummaryTimer); partnerSummaryTimer = null; }
    partnerSummaryTimer = setInterval(function() { fillPartnerSummary({ forceFresh: true }); }, PARTNER_SUMMARY_REFRESH_MS);
  }

  function stopPartnerSummaryRefresh() {
    if (!partnerSummaryTimer) return;
    clearInterval(partnerSummaryTimer);
    partnerSummaryTimer = null;
  }

  async function initAccountPage() {
    const user = await window.PartnerSession.requireAuth({ requirePartner: true });
    if (!user) return;

    window.PartnerSession.markActiveNav("account");
    window.DashboardTopbarMenu?.mount?.({ user, notify });

    updateProfileHeader(user);
    initAvatarUpload(user);

    qs("accountName").value = safeText(user.name);
    qs("accountEmail").value = safeText(user.email);
    qs("accountPhone").value = safeText(user.phone);

    qs("accountForm")?.addEventListener("submit", async function(event) {
      event.preventDefault();
      var submitBtn = event.currentTarget.querySelector('button[type="submit"]');
      var name = window.BudaSecurity?.sanitizeText ? window.BudaSecurity.sanitizeText(qs("accountName")?.value, 140) : safeText(qs("accountName")?.value);
      var phone = window.BudaSecurity?.sanitizeText ? window.BudaSecurity.sanitizeText(qs("accountPhone")?.value, 30) : safeText(qs("accountPhone")?.value);

      if (!name) { notify("الاسم مطلوب.", "error"); return; }

      setButtonLoading(submitBtn, "جارٍ الحفظ...", true);
      try {
        await window.PartnerAPI.updateMyProfile({ full_name: name, phone });
        await window.PartnerSession.refreshFromAuth();
        notify("✅ تم تحديث بيانات الحساب.", "success");
      } catch (error) {
        console.error("update profile error", error);
        notify("تعذر تحديث بيانات الحساب.", "error");
      } finally {
        setButtonLoading(submitBtn, "", false);
      }
    });

    await fillPartnerSummary({ forceFresh: true });
    startPartnerSummaryRefresh();

    document.addEventListener("visibilitychange", function() {
      if (document.visibilityState === "visible") fillPartnerSummary({ forceFresh: true });
    });

    window.addEventListener("beforeunload", function() { stopPartnerSummaryRefresh(); }, { once: true });
  }

  document.addEventListener("DOMContentLoaded", initAccountPage);
})();
