(() => {
  "use strict";

  const AVATAR_MAX_SIDE = 560;
  const AVATAR_QUALITY = 0.84;

  function escapeHtml(value) {
    return String(value || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }

  function safeText(value) {
    return String(value || "").trim();
  }

  function sanitizeImageSource(value) {
    const text = safeText(value);
    if (!text) return "";

    if (window.BudaSecurity?.sanitizeUrl) {
      return window.BudaSecurity.sanitizeUrl(text, { allowDataImages: true });
    }

    if (/^\s*javascript:/i.test(text)) return "";
    if (/^https?:\/\//i.test(text)) return text;
    if (/^blob:/i.test(text)) return text;
    const dataMatch = text.match(/^data:image\/[a-z0-9.+-]+(?:;[a-z0-9=:+-]+)*,(.+)$/i);
    if (dataMatch && String(dataMatch[1] || "").length >= 16) return text;
    return "";
  }

  function avatarInitial(user = null) {
    const name = safeText(user?.name || user?.full_name || "");
    if (name) return name.charAt(0).toUpperCase();
    const email = safeText(user?.email || "");
    if (!email) return "?";
    return email.charAt(0).toUpperCase();
  }

  function pickAvatar(user = null) {
    return sanitizeImageSource(
      user?.avatarUrl || user?.avatar_url || user?.avatar || user?.profile_image || user?.photo_url || ""
    );
  }

  function paintAvatar(imageEl, fallbackEl, avatarUrl, initialText) {
    const cleanAvatar = sanitizeImageSource(avatarUrl);
    const cleanInitial = safeText(initialText || "?").slice(0, 1) || "?";

    if (fallbackEl) fallbackEl.textContent = cleanInitial;
    if (!imageEl) return;

    if (cleanAvatar) {
      imageEl.src = cleanAvatar;
      imageEl.classList.remove("hidden");
      fallbackEl?.classList.add("hidden");
      return;
    }

    imageEl.removeAttribute("src");
    imageEl.classList.add("hidden");
    fallbackEl?.classList.remove("hidden");
  }

  function dataUrlToImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("INVALID_IMAGE_DATA"));
      img.src = dataUrl;
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("FILE_READ_FAILED"));
      reader.readAsDataURL(file);
    });
  }

  async function optimizeAvatarDataUrl(rawDataUrl) {
    const safeRaw = sanitizeImageSource(rawDataUrl);
    if (!safeRaw) throw new Error("INVALID_IMAGE_FORMAT");

    const image = await dataUrlToImage(safeRaw);
    const maxSide = Math.max(image.width, image.height) || 1;
    const ratio = Math.min(1, AVATAR_MAX_SIDE / maxSide);
    const width = Math.max(1, Math.round(image.width * ratio));
    const height = Math.max(1, Math.round(image.height * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return safeRaw;

    context.drawImage(image, 0, 0, width, height);
    return sanitizeImageSource(canvas.toDataURL("image/jpeg", AVATAR_QUALITY)) || safeRaw;
  }

  async function fileToAvatarDataUrl(file) {
    if (!file) throw new Error("MISSING_FILE");
    const raw = await readFileAsDataUrl(file);
    return optimizeAvatarDataUrl(raw);
  }

  function askLogoutConfirmation() {
    return new Promise((resolve) => {
      if (!document.body) {
        resolve(false);
        return;
      }

      const overlay = document.createElement("div");
      overlay.className = "logout-confirm-overlay";
      overlay.innerHTML = `
        <div class="logout-confirm-card" role="dialog" aria-modal="true" aria-labelledby="logoutConfirmTitle">
          <h3 id="logoutConfirmTitle">تأكيد تسجيل الخروج</h3>
          <p>هل أنت متأكد أنك تريد تسجيل الخروج الآن؟</p>
          <div class="logout-confirm-actions">
            <button type="button" class="btn-secondary" data-action="cancel">إلغاء</button>
            <button type="button" class="btn-danger" data-action="confirm">تسجيل الخروج</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      requestAnimationFrame(() => {
        overlay.classList.add("is-open");
      });

      const cancelBtn = overlay.querySelector('[data-action="cancel"]');
      const confirmBtn = overlay.querySelector('[data-action="confirm"]');
      let completed = false;

      function finish(result) {
        if (completed) return;
        completed = true;
        overlay.classList.remove("is-open");
        document.removeEventListener("keydown", handleKeydown);
        setTimeout(() => overlay.remove(), 180);
        resolve(Boolean(result));
      }

      function handleKeydown(event) {
        if (event.key === "Escape") {
          finish(false);
          return;
        }
        if (event.key === "Enter" && document.activeElement === confirmBtn) {
          finish(true);
        }
      }

      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) finish(false);
      });
      cancelBtn?.addEventListener("click", () => finish(false));
      confirmBtn?.addEventListener("click", () => finish(true));
      document.addEventListener("keydown", handleKeydown);
      cancelBtn?.focus();
    });
  }

  function createUserMenuController(options = {}) {
    const root = document.getElementById("userMenuRoot");
    if (!root) return null;

    const trigger = document.getElementById("userMenuTrigger");
    const panel = document.getElementById("userMenuPanel");
    const triggerImage = document.getElementById("userAvatarImage");
    const triggerFallback = document.getElementById("userAvatarInitial");
    const panelImage = document.getElementById("userMenuAvatarImage");
    const panelFallback = document.getElementById("userMenuAvatarInitial");
    const emailLabel = document.getElementById("userMenuEmail");
    const uploadInput = document.getElementById("userAvatarInput");
    const uploadBtn = document.getElementById("userAvatarUploadBtn");
    const logoutBtn = document.getElementById("logoutBtn");

    if (!trigger || !panel || !uploadInput || !uploadBtn || !logoutBtn) return null;

    // Move panel to body so centering works properly
    document.body.appendChild(panel);

    // Add close button to user menu panel header
    var closeMenuBtn = document.createElement("button");
    closeMenuBtn.type = "button";
    closeMenuBtn.className = "menu-close-btn";
    closeMenuBtn.innerHTML = "✕";
    closeMenuBtn.setAttribute("aria-label", "إغلاق");
    closeMenuBtn.addEventListener("click", closeMenu);
    var menuHeader = panel.querySelector(".user-menu-header");
    if (menuHeader) menuHeader.appendChild(closeMenuBtn);

    // Notification bell
    var bellBtn = document.createElement("button");
    bellBtn.type = "button";
    bellBtn.className = "notif-bell";
    bellBtn.setAttribute("aria-label", "الإشعارات");
    bellBtn.innerHTML = '<i class="fa-solid fa-bell"></i><span id="notifBadge" class="notif-badge hidden">0</span>';
    root.parentNode.insertBefore(bellBtn, root);

    var notifOverlay = document.createElement("div");
    notifOverlay.className = "menu-overlay hidden";
    notifOverlay.id = "notifOverlay";
    notifOverlay.style.zIndex = "99";
    notifOverlay.addEventListener("click", function() { closeNotif(); });
    document.body.appendChild(notifOverlay);

    var notifDropdown = document.createElement("div");
    notifDropdown.className = "notif-dropdown hidden";
    notifDropdown.id = "notifDropdown";
    notifDropdown.style.zIndex = "101";
    notifDropdown.style.position = "fixed";
    notifDropdown.style.top = "70px";
    notifDropdown.style.insetInlineEnd = "16px";
    notifDropdown.innerHTML = '<div class="notif-header"><strong>الإشعارات</strong><button type="button" class="menu-close-btn" id="notifCloseBtn" aria-label="إغلاق">✕</button></div><div id="notifList" class="notif-list"></div>';
    document.body.appendChild(notifDropdown);

    // Ensure static positioning for notif
    notifDropdown.style.position = "fixed";
    notifDropdown.style.top = "70px";
    notifDropdown.style.insetInlineEnd = "16px";

    function closeNotif() {
      notifDropdown.classList.add("hidden");
      notifOverlay.classList.add("hidden");
      notifOpen = false;
    }

    document.getElementById("notifCloseBtn")?.addEventListener("click", closeNotif);

    var notifOpen = false;
    bellBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      notifOpen = !notifOpen;
      notifDropdown.classList.toggle("hidden", !notifOpen);
      notifOverlay.classList.toggle("hidden", !notifOpen);
      if (notifOpen) loadNotifList(user?.email);
    });
    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape" && notifOpen) closeNotif();
    });

    async function loadNotifList(email) {
      if (!email || !window.PartnerAPI?.raw) return;
      var list = document.getElementById("notifList");
      if (!list) return;
      list.innerHTML = "<p class='muted' style='padding:12px;'>جار التحميل...</p>";
      try {
        var c = window.PartnerAPI.raw();
        var { data } = await c.from("partner_notifications").select("*").eq("partner_email", email).order("created_at", { ascending: false }).limit(10);
        if (!data || !data.length) {
          list.innerHTML = "<p class='muted' style='padding:12px;'>لا توجد إشعارات</p>";
          return;
        }
        list.innerHTML = data.map(function(n) {
          var icon = n.type === "product_approved" ? "✅" : n.type === "product_rejected" ? "❌" : n.type === "admin_note" ? "📢" : "⏳";
          return '<div class="notif-item' + (n.is_read ? "" : " notif-unread") + '">' +
            '<span class="notif-icon">' + icon + '</span>' +
            '<div class="notif-body"><strong>' + escapeHtml(n.title || "") + '</strong><p>' + escapeHtml(n.message || "") + '</p></div>' +
          '</div>';
        }).join("");
      } catch(e) {
        list.innerHTML = "<p class='muted' style='padding:12px;'>خطأ في التحميل</p>";
      }
    }

    async function updateNotifBadge(email) {
      if (!email || !window.PartnerAPI?.raw) return;
      try {
        var c = window.PartnerAPI.raw();
        var { data } = await c.from("partner_notifications").select("id").eq("partner_email", email).eq("is_read", false).limit(100);
        var badge = document.getElementById("notifBadge");
        if (!badge) return;
        var count = (Array.isArray(data) ? data.length : 0);
        if (count > 0) {
          badge.textContent = String(count);
          badge.classList.remove("hidden");
        } else {
          badge.classList.add("hidden");
        }
      } catch(e) {}
    }

    const notify = typeof options.notify === "function" ? options.notify : () => {};
    let user = options.user || window.PartnerSession?.getCurrentUser?.() || null;
    let busy = false;
    let signingOut = false;

    updateNotifBadge(user?.email);
    setInterval(function() { updateNotifBadge(user?.email); }, 30000);

    triggerImage?.addEventListener("error", () => {
      triggerImage.removeAttribute("src");
      triggerImage.classList.add("hidden");
      triggerFallback?.classList.remove("hidden");
    });
    panelImage?.addEventListener("error", () => {
      panelImage.removeAttribute("src");
      panelImage.classList.add("hidden");
      panelFallback?.classList.remove("hidden");
    });

    function closeMenu() {
      panel.classList.add("hidden");
      var ov = document.getElementById("userMenuOverlay");
      if (ov) ov.classList.add("hidden");
      trigger.setAttribute("aria-expanded", "false");
    }

    function openMenu() {
      var ov = document.getElementById("userMenuOverlay");
      if (!ov) {
        ov = document.createElement("div");
        ov.id = "userMenuOverlay";
        ov.className = "menu-overlay hidden";
        ov.style.zIndex = "120";
        ov.addEventListener("click", closeMenu);
        document.body.appendChild(ov);
      }
      panel.classList.remove("hidden");
      ov.classList.remove("hidden");
      trigger.setAttribute("aria-expanded", "true");
    }

    function setBusy(isBusy, text = "") {
      busy = Boolean(isBusy);
      if (!uploadBtn.dataset.defaultText) uploadBtn.dataset.defaultText = uploadBtn.textContent || "";
      uploadBtn.disabled = busy;
      uploadBtn.textContent = busy ? text : uploadBtn.dataset.defaultText;
    }

    function render(nextUser = null) {
      if (nextUser) {
        user = nextUser;
      }

      const email = safeText(user?.email || window.PartnerSession?.getCurrentEmail?.() || "");
      const avatarUrl = pickAvatar(user);
      const initial = avatarInitial({
        ...(user || {}),
        email,
      });

      if (emailLabel) emailLabel.textContent = email || "-";
      paintAvatar(triggerImage, triggerFallback, avatarUrl, initial);
      paintAvatar(panelImage, panelFallback, avatarUrl, initial);
    }

    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      if (panel.classList.contains("hidden")) {
        openMenu();
      } else {
        closeMenu();
      }
    });

    document.addEventListener("click", (event) => {
      if (panel.contains(event.target) || trigger.contains(event.target)) return;
      closeMenu();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });

    uploadBtn.addEventListener("click", () => {
      if (busy) return;
      uploadInput.click();
    });

    uploadInput.addEventListener("change", async (event) => {
      const file = event.target?.files?.[0] || null;
      uploadInput.value = "";
      if (!file) return;

      setBusy(true, "جاري تجهيز الصورة...");
      try {
        const avatarDataUrl = await fileToAvatarDataUrl(file);
        await window.PartnerAPI.updateMyProfile({ avatar_url: avatarDataUrl });
        const refreshed = await window.PartnerSession.refreshFromAuth();
        if (refreshed) {
          user = refreshed;
        } else {
          user = {
            ...(user || {}),
            avatarUrl: avatarDataUrl,
          };
        }
        render(user);
        notify("تم تحديث صورة الحساب.", "success");
      } catch (error) {
        console.error("avatar upload failed", error);
        notify("تعذر رفع الصورة. اختر صورة أصغر وحاول مرة أخرى.", "error");
      } finally {
        setBusy(false);
      }
    });

    logoutBtn.addEventListener("click", async () => {
      if (signingOut) return;
      const confirmed = await askLogoutConfirmation();
      if (!confirmed) return;

      signingOut = true;
      logoutBtn.disabled = true;
      closeMenu();
      await window.PartnerSession.signOut();
      window.PartnerSession.goTo(window.APP_ROUTES.login);
    });

    render(user);
    return {
      close: closeMenu,
      render,
      setUser(nextUser) {
        render(nextUser);
      },
    };
  }

  window.DashboardTopbarMenu = Object.freeze({
    mount: createUserMenuController,
  });
})();
