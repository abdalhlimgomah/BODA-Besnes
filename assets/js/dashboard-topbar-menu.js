(() => {
  "use strict";

  const AVATAR_MAX_SIDE = 560;
  const AVATAR_QUALITY = 0.84;

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

    const notify = typeof options.notify === "function" ? options.notify : () => {};
    let user = options.user || window.PartnerSession?.getCurrentUser?.() || null;
    let busy = false;
    let signingOut = false;

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
      trigger.setAttribute("aria-expanded", "false");
    }

    function openMenu() {
      panel.classList.remove("hidden");
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
      if (root.contains(event.target)) return;
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
