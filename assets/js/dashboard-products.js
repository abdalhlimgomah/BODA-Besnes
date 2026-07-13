(() => {
  "use strict";
  // [DASHBOARD-PRODUCTS] loaded

  const money = new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const state = {
    products: [],
    currentUser: null,
    partnerAccess: null,
    productActionsAllowed: true,
    refreshIntervalId: null,
    unreadNotifications: 0,
    notificationsAvailable: true,
  };

  function safeText(value) {
    return String(value || "").trim();
  }

  function sanitizeTextInput(value, maxLength = 500) {
    return window.BudaSecurity?.sanitizeText
      ? window.BudaSecurity.sanitizeText(value, maxLength)
      : safeText(value).slice(0, maxLength);
  }

  function sanitizeImageInput(value) {
    const raw = String(value ?? "")
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .trim();
    if (!raw) return "";
    if (window.BudaSecurity?.sanitizeUrl) {
      return window.BudaSecurity.sanitizeUrl(raw, { allowDataImages: true });
    }
    return raw.replace(/^javascript:/i, "");
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

  function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function normalizeReviewStatus(value) {
    const key = safeText(value).toLowerCase().replace(/\s+/g, "_");
    if (!key) return "pending";
    if (key.includes("reviewed") || key.includes("approved") || key.includes("published") || key.includes("قبول")) {
      return "reviewed";
    }
    if (key.includes("rejected") || key.includes("رفض")) return "rejected";
    return "pending";
  }

  function reviewStatusLabel(value) {
    const key = normalizeReviewStatus(value);
    if (key === "reviewed") return "✓ تمت الموافقة";
    if (key === "rejected") return "✕ مرفوض";
    return "⏳ قيد المراجعة";
  }

  function reviewStatusClass(value) {
    const key = normalizeReviewStatus(value);
    if (key === "reviewed") return "status-approved";
    if (key === "rejected") return "status-rejected";
    return "status-pending";
  }

  function notify(message, type = "error") {
    const holder = document.getElementById("productsStatus");
    if (!holder) return;
    holder.classList.remove("hidden", "error", "success", "info");
    holder.classList.add("status-note", type);
    holder.textContent = safeText(message);
  }

  function askDeleteConfirmation() {
    return new Promise((resolve) => {
      if (!document.body) {
        resolve(false);
        return;
      }

      const overlay = document.createElement("div");
      overlay.className = "logout-confirm-overlay";
      overlay.innerHTML = `
        <div class="logout-confirm-card" role="dialog" aria-modal="true" aria-labelledby="deleteConfirmTitle">
          <h3 id="deleteConfirmTitle">تأكيد حذف المنتج</h3>
          <p>هل أنت متأكد أنك تريد حذف هذا المنتج الآن؟</p>
          <div class="logout-confirm-actions">
            <button type="button" class="btn-secondary" data-action="cancel">إلغاء</button>
            <button type="button" class="btn-danger" data-action="confirm">حذف المنتج</button>
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

  function getProductMediaList(product) {
    var items = [];
    // Images
    var imgs = [];
    if (Array.isArray(product.images)) {
      imgs = product.images.filter(Boolean).slice(0, 8);
    } else {
      for (var i = 1; i <= 8; i++) {
        if (product["image" + i]) imgs.push(product["image" + i]);
      }
      for (var i = 1; i <= 8; i++) {
        if (product["img" + i] && !imgs.includes(product["img" + i])) imgs.push(product["img" + i]);
      }
      for (var i = 1; i <= 8; i++) {
        if (product["image_link" + i] && !imgs.includes(product["image_link" + i])) imgs.push(product["image_link" + i]);
      }
      var raw = product.raw || {};
      for (var i = 1; i <= 8; i++) {
        if (raw["image" + i] && !imgs.includes(raw["image" + i])) imgs.push(raw["image" + i]);
      }
      for (var i = 1; i <= 8; i++) {
        if (raw["img" + i] && !imgs.includes(raw["img" + i])) imgs.push(raw["img" + i]);
      }
      for (var i = 1; i <= 8; i++) {
        if (raw["image_link" + i] && !imgs.includes(raw["image_link" + i])) imgs.push(raw["image_link" + i]);
      }
      if (product.image && !imgs.includes(product.image)) imgs.push(product.image);
      imgs = imgs.filter(Boolean).slice(0, 8);
    }
    imgs.forEach(function(src) { items.push({ type: "image", src: src }); });
    // Video
    var videoUrl = product.videoUrl || "";
    if (videoUrl) items.push({ type: "video", src: videoUrl });
    return items;
  }

  function openGalleryViewer(productId) {
    var p = state.products.find(function(item) { return String(item.id) === String(productId); });
    if (!p) return;
    var media = getProductMediaList(p);
    if (media.length < 2) return;
    var current = 0;

    function renderSlide(item, i) {
      if (item.type === "video") {
        return '<video src="' + escapeHtml(item.src) + '" class="catalog-gallery-overlay-img' + (i === current ? " active" : "") + '" data-index="' + i + '" controls playsinline preload="auto" style="object-fit:contain;pointer-events:auto;"></video>';
      }
      return '<img src="' + escapeHtml(item.src) + '" alt="" class="catalog-gallery-overlay-img' + (i === current ? " active" : "") + '" data-index="' + i + '" />';
    }

    var overlay = document.createElement("div");
    overlay.className = "catalog-gallery-overlay";
    overlay.innerHTML =
      '<div class="catalog-gallery-overlay-inner">' +
      '<button class="catalog-gallery-overlay-close" aria-label="إغلاق">&times;</button>' +
      '<div class="catalog-gallery-overlay-main">' +
      '<button class="catalog-gallery-overlay-arrow catalog-gallery-overlay-prev" aria-label="السابق"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg></button>' +
      '<div class="catalog-gallery-overlay-image-wrap">' +
      media.map(function(item, i) { return renderSlide(item, i); }).join("") +
      '</div>' +
      '<button class="catalog-gallery-overlay-arrow catalog-gallery-overlay-next" aria-label="التالي"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg></button>' +
      '</div>' +
      '<div class="catalog-gallery-overlay-bottom">' +
      '<div class="catalog-gallery-overlay-dots">' +
      media.map(function(_, i) {
        return '<span' + (i === current ? " class=\"active\"" : "") + ' data-index="' + i + '"></span>';
      }).join("") +
      '</div>' +
      '<div class="catalog-gallery-overlay-counter"><span class="catalog-gv-current">' + (current + 1) + '</span>/<span class="catalog-gv-total">' + media.length + '</span></div>' +
      '</div></div>';

    document.body.appendChild(overlay);

    function pauseCurrentVideo() {
      overlay.querySelectorAll(".catalog-gallery-overlay-img.active").forEach(function(el) {
        if (el.tagName === "VIDEO") el.pause();
      });
    }

    function updateGallery(idx) {
      if (idx < 0) idx = media.length - 1;
      if (idx >= media.length) idx = 0;
      pauseCurrentVideo();
      current = idx;
      overlay.querySelectorAll(".catalog-gallery-overlay-img").forEach(function(el, i) {
        el.classList.toggle("active", i === current);
      });
      overlay.querySelectorAll(".catalog-gallery-overlay-dots span").forEach(function(s, i) {
        s.classList.toggle("active", i === current);
      });
      var counterEl = overlay.querySelector(".catalog-gv-current");
      if (counterEl) counterEl.textContent = current + 1;
    }

    overlay.querySelector(".catalog-gallery-overlay-close").addEventListener("click", function() { overlay.remove(); });
    overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector(".catalog-gallery-overlay-prev").addEventListener("click", function() { updateGallery(current - 1); });
    overlay.querySelector(".catalog-gallery-overlay-next").addEventListener("click", function() { updateGallery(current + 1); });
    overlay.querySelectorAll(".catalog-gallery-overlay-dots span").forEach(function(s) {
      s.addEventListener("click", function() {
        var idx = parseInt(s.getAttribute("data-index"), 10);
        if (!isNaN(idx)) updateGallery(idx);
      });
    });
    document.addEventListener("keydown", function keyHandler(e) {
      if (!document.body.contains(overlay)) { document.removeEventListener("keydown", keyHandler); return; }
      if (e.key === "Escape") overlay.remove();
      if (e.key === "ArrowLeft") updateGallery(current - 1);
      if (e.key === "ArrowRight") updateGallery(current + 1);
    });
  }

  function updateCatalogCounter(mediaWrap) {
    var counter = mediaWrap && mediaWrap.querySelector(".catalog-img-counter .catalog-img-current");
    if (!counter) return;
    var imgs = mediaWrap.querySelectorAll(".catalog-gallery-img");
    var active = -1;
    imgs.forEach(function(img, i) { if (img.classList.contains("active")) active = i; });
    if (active >= 0) counter.textContent = active + 1;
  }

  function applyPartnerAccess(access) {
    if (!access?.exists) {
      state.productActionsAllowed = false;
      notify("لا يمكنك إدارة المنتجات قبل إرسال طلب الشراكة.", "info");
      return false;
    }

    if (access.normalizedStatus === "rejected") {
      state.productActionsAllowed = false;
      window.PartnerSession.goTo(window.APP_ROUTES.dashboardBlocked);
      return false;
    }

    if (access.normalizedStatus !== "approved") {
      state.productActionsAllowed = false;
      notify("لا يمكنك إضافة أو تعديل أو حذف المنتجات إلا بعد قبول طلب الشراكة.", "info");
      return false;
    }

    state.productActionsAllowed = true;
    return true;
  }

  async function ensureProductActionsAllowed(forceFresh = false) {
    if (!window.PartnerSession?.getPartnerAccess || !state.currentUser) return true;
    const access = await window.PartnerSession.getPartnerAccess(state.currentUser, { forceFresh });
    state.partnerAccess = access;
    return applyPartnerAccess(access);
  }

  function updateAddButtonsState() {
    document.querySelectorAll(".add-product-btn").forEach((link) => {
      const isAllowed = state.productActionsAllowed;
      link.classList.toggle("is-disabled-link", !isAllowed);
      if (!isAllowed) {
        link.setAttribute("aria-disabled", "true");
        link.dataset.disabled = "1";
      } else {
        link.removeAttribute("aria-disabled");
        delete link.dataset.disabled;
      }
    });
  }

  function renderProducts() {
    const holder = document.getElementById("productsGrid");
    if (!holder) return;

    updateAddButtonsState();

    if (!state.products.length) {
      const actionNode = state.productActionsAllowed
        ? '<a class="btn-primary add-product-btn" href="product-editor.html">إضافة منتج جديد</a>'
        : '<p class="muted">إضافة المنتجات متاحة بعد قبول طلب الشراكة.</p>';

      holder.innerHTML = `
        <article class="catalog-empty">
          <h3>لا توجد منتجات مضافة حتى الآن</h3>
          <p class="muted">ابدأ بإضافة أول منتج وسيظهر هنا بشكل احترافي.</p>
          ${actionNode}
        </article>
      `;
      updateAddButtonsState();
      return;
    }

    const pending = state.products.filter(p => {
      const raw = safeText(p.reviewStatus || p?.raw?.review_status || p?.raw?.reviewStatus || "");
      return !raw.includes("reviewed") && !raw.includes("approved") && !raw.includes("قبول") && !raw.includes("rejected") && !raw.includes("رفض");
    });
    const visible = state.products.filter(p => !pending.includes(p));

    let pendingBanner = "";
    if (pending.length) {
      pendingBanner = `
        <div class="catalog-pending-banner">
          <i class="fa-solid fa-clock"></i>
          <span>لديك <strong>${pending.length}</strong> منتج${pending.length > 1 ? "ات" : ""} بانتظار مراجعة الأدمن. سيظهر هنا بعد الموافقة.</span>
        </div>
      `;
    }

    var sortedProducts = state.products.slice().sort(function(a, b) {
      var aRaw = safeText(a.reviewStatus || a?.raw?.review_status || a?.raw?.reviewStatus || "");
      var bRaw = safeText(b.reviewStatus || b?.raw?.review_status || b?.raw?.reviewStatus || "");
      var aPending = !aRaw.includes("reviewed") && !aRaw.includes("approved") && !aRaw.includes("قبول") && !aRaw.includes("rejected") && !aRaw.includes("رفض");
      var bPending = !bRaw.includes("reviewed") && !bRaw.includes("approved") && !bRaw.includes("قبول") && !bRaw.includes("rejected") && !bRaw.includes("رفض");
      if (aPending && !bPending) return -1;
      if (!aPending && bPending) return 1;
      return 0;
    });

    holder.innerHTML = pendingBanner + sortedProducts
      .map((product) => {
        const isPending = pending.includes(product);
        const reviewStatusRaw = product.reviewStatus || product?.raw?.review_status || product?.raw?.reviewStatus || "";
        const reviewStatusNorm = normalizeReviewStatus(reviewStatusRaw);
        const isRejected = reviewStatusNorm === "rejected";
        var allMedia = getProductMediaList(product);
        var hasVideo = allMedia.some(function(m) { return m.type === "video"; });
        const allImages = allMedia.filter(function(m) { return m.type === "image"; }).map(function(m) { return m.src; });
        const hasMultipleImages = allMedia.length > 1;
        const image = allImages[0] || "";
        const hasDiscount = toNumber(product.discountPercent) > 0;
        const finalPrice = hasDiscount
          ? product.price - (product.price * product.discountPercent) / 100
          : product.price;
        const reviewStatusText = reviewStatusLabel(reviewStatusRaw);
        const reviewStatusCls = reviewStatusClass(reviewStatusRaw);
        const safeId = encodeURIComponent(String(product.id || ""));
        const safeName = escapeHtml(product.name || "منتج بدون اسم");
        const safeCategory = escapeHtml(product.category || "غير مصنف");
        const safeQty = escapeHtml(toNumber(product.quantity));
        const safeDescription = escapeHtml(sanitizeTextInput(product.description || "", 180));
        const safeImage = escapeHtml(image);
        let cardClass = "catalog-product-card";
        if (isPending) cardClass += " card-pending";
        if (isRejected) cardClass += " card-rejected";

        let imgsHtml = "";
        if (allImages.length) {
          for (var gi = 0; gi < allImages.length; gi++) {
            imgsHtml += '<img class="catalog-gallery-img' + (gi === 0 ? " active" : "") + '" src="' + escapeHtml(allImages[gi]) + '" alt="' + safeName + '" loading="lazy" />';
          }
        }
        // If no images but has video: show placeholder
        if (!allImages.length && hasVideo) {
          imgsHtml = '<div class="catalog-no-image">فيديو</div>';
        }

        var videoBadge = "";
        if (hasVideo) {
          videoBadge = '<span class="catalog-video-badge"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 5v14l11-7z"/></svg></span>';
        }

        let dotsHtml = "";
        if (hasMultipleImages) {
          for (var di = 0; di < allMedia.length; di++) {
            dotsHtml += '<span' + (di === 0 ? ' class="active"' : "") + ' data-index="' + di + '"></span>';
          }
        }

        let counterHtml = "";
        if (hasMultipleImages) {
          counterHtml = '<span class="catalog-img-counter"><span class="catalog-img-current">1</span>/<span class="catalog-img-total">' + allMedia.length + '</span></span>';
        }

        const actions = state.productActionsAllowed && !isRejected
          ? `
              <a class="btn-secondary product-edit-link" href="product-editor.html?id=${safeId}">تعديل</a>
              <button class="btn-danger" data-delete="${escapeHtml(product.id)}" type="button">حذف</button>
            `
          : isRejected
            ? '<span class="muted">المنتج مرفوض، .</span>'
            : '<span class="muted">الإضافة والتعديل والحذف متاحة بعد قبول الطلب.</span>';

        return `
          <article class="${cardClass}" data-product-id="${escapeHtml(product.id)}">
            <div class="catalog-product-media${hasMultipleImages ? ' catalog-product-media-gallery' : ''}" data-gallery-id="${escapeHtml(product.id)}">
              ${allImages.length ? imgsHtml : '<div class="catalog-no-image">بدون صورة</div>'}
              ${videoBadge}
              ${hasMultipleImages ? '<span class="catalog-img-dots">' + dotsHtml + '</span>' : ""}
              ${counterHtml}
            </div>
            <div class="catalog-product-body">
              <div class="catalog-product-head">
                <h3>${safeName}</h3>
              <div class="inline-actions">
                  <span class="pill">${safeCategory}</span>
                  <span class="pill status-badge ${reviewStatusCls}">${escapeHtml(reviewStatusText)}</span>
                </div>
              </div>
              <p class="muted catalog-product-description">${safeDescription || "لا يوجد وصف لهذا المنتج."}</p>
              <div class="catalog-price-line">
                <span>${money.format(finalPrice)}</span>
                ${hasDiscount ? `<del>${money.format(toNumber(product.price))}</del>` : ""}
              </div>
              <small class="muted">الكمية المتاحة: ${safeQty}</small>
              <div class="inline-actions catalog-actions">
                ${actions}
              </div>
            </div>
          </article>
        `;
      })
      .join("");

    updateAddButtonsState();
  }

  async function loadProducts() {
    try {
      state.products = await window.PartnerAPI.getProductsForCurrentUser();
      renderProducts();
      const countNode = document.getElementById("productsCount");
      if (countNode) countNode.textContent = String(state.products.length);
    } catch (error) {
      console.error("load products error", error);
      notify("تعذر تحميل المنتجات.", "error");
    }
  }

  async function handleProductsGridClick(event) {
    // Gallery dot click
    var dot = event.target.closest(".catalog-img-dots span");
    if (dot) {
      event.stopPropagation();
      var mediaWrap = dot.closest(".catalog-product-media");
      if (!mediaWrap) return;
      var imgs = mediaWrap.querySelectorAll(".catalog-gallery-img");
      var idx = parseInt(dot.getAttribute("data-index"), 10);
      if (isNaN(idx)) return;
      imgs.forEach(function(img) { img.classList.remove("active"); });
      if (imgs[idx]) imgs[idx].classList.add("active");
      var dots = mediaWrap.querySelector(".catalog-img-dots");
      if (dots) {
        dots.querySelectorAll("span").forEach(function(s) { s.classList.remove("active"); });
        if (dots.children[idx]) dots.children[idx].classList.add("active");
      }
      var counter = mediaWrap.querySelector(".catalog-img-counter .catalog-img-current");
      if (counter) counter.textContent = idx + 1;
      return;
    }

    // Gallery open click
    var media = event.target.closest(".catalog-product-media[data-gallery-id]");
    if (media && !event.target.closest(".catalog-img-dots")) {
      event.stopPropagation();
      var pid = media.getAttribute("data-gallery-id");
      openGalleryViewer(pid);
      return;
    }

    const disabledAddLink = event.target.closest(".add-product-btn[data-disabled='1']");
    if (disabledAddLink) {
      event.preventDefault();
      notify("لا يمكنك إضافة المنتجات إلا بعد قبول طلب الشراكة.", "info");
      return;
    }

    const editLink = event.target.closest(".product-edit-link");
    if (editLink && !state.productActionsAllowed) {
      event.preventDefault();
      notify("لا يمكنك تعديل المنتجات إلا بعد قبول طلب الشراكة.", "info");
      return;
    }

    const deleteBtn = event.target.closest("[data-delete]");
    if (!deleteBtn) return;

    if (!state.productActionsAllowed) {
      notify("لا يمكنك حذف المنتجات إلا بعد قبول طلب الشراكة.", "info");
      return;
    }

    const productId = deleteBtn.getAttribute("data-delete");
    if (!productId) return;

    const product = state.products.find(p => String(p.id) === productId || p.legacy_my_products_id === productId);
    if (product) {
      const raw = safeText(product.reviewStatus || product?.raw?.review_status || product?.raw?.reviewStatus || "");
      if (normalizeReviewStatus(raw) === "rejected") {
        notify("المنتج المرفوض لا يمكن حذفه.", "info");
        return;
      }
    }

    const canManageProducts = await ensureProductActionsAllowed(true);
    if (!canManageProducts) return;

    const confirmed = await askDeleteConfirmation();
    if (!confirmed) return;

    try {
      await window.PartnerAPI.deleteProduct(productId, state.currentUser);
      notify("تم حذف المنتج بنجاح.", "success");
      await loadProducts();
    } catch (error) {
      console.error("delete product error", error);
      const errorCode = String(error?.message || "");
      if (errorCode === "PARTNER_REQUEST_REJECTED") {
        window.PartnerSession.goTo(window.APP_ROUTES.dashboardBlocked);
      } else if (errorCode === "PARTNER_NOT_APPROVED") {
        notify("لا يمكنك حذف المنتجات إلا بعد قبول طلب الشراكة.", "error");
      } else {
        notify("تعذر حذف المنتج.", "error");
      }
    }
  }

  async function loadNotifications() {
    if (!state.currentUser?.email || !state.notificationsAvailable) return;
    try {
      const client = window.PartnerAPI?.raw?.();
      if (!client) return;
      const { data, error } = await client
        .from("partner_notifications")
        .select("*")
        .eq("partner_email", state.currentUser.email)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) {
        if (error.code === "PGRST116" || error.code === "42P01" || error.status === 404) {
          state.notificationsAvailable = false;
        }
        return;
      }
      const items = Array.isArray(data) ? data : [];
      renderNotifications(items);
      state.unreadNotifications = items.filter((n) => !n.is_read).length;
      updateNotificationBadge();
    } catch {
      state.notificationsAvailable = false;
    }
  }

  function renderNotifications(items) {
    const section = document.getElementById("notificationsSection");
    const list = document.getElementById("notificationsList");
    if (!section || !list) return;
    if (!items.length) {
      section.classList.add("hidden");
      return;
    }
    section.classList.remove("hidden");
    list.innerHTML = items
      .map((n) => {
        const isRead = n.is_read ? "notification-read" : "";
        const icon = n.type === "product_approved" ? "✅" : n.type === "product_rejected" ? "❌" : "⏳";
        return `
          <div class="notification-item ${isRead}" data-id="${n.id}">
            <div class="notification-icon">${icon}</div>
            <div class="notification-body">
              <strong>${escapeHtml(n.title || "")}</strong>
              <p>${escapeHtml(n.message || "")}</p>
              <small>${n.created_at ? new Date(n.created_at).toLocaleString("ar-EG") : ""}</small>
            </div>
            <button class="notification-dismiss" data-action="dismiss-notification" data-id="${n.id}">✕</button>
          </div>
        `;
      })
      .join("");
  }

  async function dismissNotification(notificationId) {
    try {
      const client = window.PartnerAPI?.raw?.();
      if (!client) return;
      await client.from("partner_notifications").update({ is_read: true }).eq("id", notificationId);
      await loadNotifications();
    } catch {
      // silent
    }
  }

  async function clearAllNotifications() {
    if (!state.currentUser?.email) return;
    try {
      const client = window.PartnerAPI?.raw?.();
      if (!client) return;
      await client.from("partner_notifications").update({ is_read: true }).eq("partner_email", state.currentUser.email);
      await loadNotifications();
    } catch {
      // silent
    }
  }

  async function checkNotifications() {
    if (!state.currentUser?.email || !state.notificationsAvailable) return;
    try {
      const client = window.PartnerAPI?.raw?.();
      if (!client) return;
      const { data, error } = await client
        .rpc("get_unread_notifications_count", { p_email: state.currentUser.email });
      if (error) {
        if (error.code === "PGRST202" || error.status === 404) {
          state.notificationsAvailable = false;
        }
        return;
      }
      if (data != null) {
        state.unreadNotifications = Number(data) || 0;
        updateNotificationBadge();
      }
    } catch {
      state.notificationsAvailable = false;
    }
  }

  function updateNotificationBadge() {
    const badge = document.getElementById("notificationBadge");
    if (!badge) {
      const nav = document.querySelector('[data-nav="products"]');
      if (!nav) return;
      const existing = nav.querySelector(".notification-badge");
      if (existing) existing.remove();
      if (state.unreadNotifications > 0) {
        const b = document.createElement("span");
        b.className = "notification-badge";
        b.id = "notificationBadge";
        b.textContent = String(state.unreadNotifications);
        nav.appendChild(b);
      }
      return;
    }
    if (state.unreadNotifications > 0) {
      badge.textContent = String(state.unreadNotifications);
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  function startAutoRefresh() {
    if (state.refreshIntervalId) clearInterval(state.refreshIntervalId);
    state.refreshIntervalId = setInterval(async () => {
      await loadProducts();
    }, 10000);
  }

  function handleNotificationsClick(event) {
    const dismissBtn = event.target.closest("[data-action='dismiss-notification']");
    if (dismissBtn) {
      const notifId = dismissBtn.getAttribute("data-id");
      if (notifId) dismissNotification(notifId);
      return;
    }
  }

  async function initProductsPage() {
    const user = await window.PartnerSession.requireAuth({ requirePartner: true });
    if (!user) return;

    state.currentUser = user;
    window.PartnerSession.markActiveNav("products");
    window.DashboardTopbarMenu?.mount?.({
      user,
      notify,
    });

    await ensureProductActionsAllowed(true);

    document.addEventListener("click", handleProductsGridClick);
    document.addEventListener("click", handleNotificationsClick);
    document.getElementById("clearNotificationsBtn")?.addEventListener("click", clearAllNotifications);

    await loadProducts();
    await loadNotifications();
    await checkNotifications();
    startAutoRefresh();

    // Listen for focus to refresh immediately
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        loadProducts();
        checkNotifications();
      }
    });
  }

  // Cleanup on unload
  window.addEventListener("beforeunload", () => {
    if (state.refreshIntervalId) {
      clearInterval(state.refreshIntervalId);
    }
  });

  document.addEventListener("DOMContentLoaded", initProductsPage);
})();
