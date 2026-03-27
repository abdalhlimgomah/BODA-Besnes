(() => {
  "use strict";

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
    if (key === "reviewed") return "تمت المراجعة";
    if (key === "rejected") return "مرفوض";
    return "قيد المراجعة";
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

  function getProductCardImage(product) {
    return sanitizeImageInput(product.images?.[0] || "");
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

    holder.innerHTML = state.products
      .map((product) => {
        const image = getProductCardImage(product);
        const hasDiscount = toNumber(product.discountPercent) > 0;
        const finalPrice = hasDiscount
          ? product.price - (product.price * product.discountPercent) / 100
          : product.price;
        const reviewStatusText = reviewStatusLabel(product.reviewStatus || product.review_status || product.publicationStatus || "");
        const safeId = encodeURIComponent(String(product.id || ""));
        const safeName = escapeHtml(product.name || "منتج بدون اسم");
        const safeCategory = escapeHtml(product.category || "غير مصنف");
        const safeQty = escapeHtml(toNumber(product.quantity));
        const safeDescription = escapeHtml(sanitizeTextInput(product.description || "", 180));
        const safeImage = escapeHtml(image);

        const actions = state.productActionsAllowed
          ? `
              <a class="btn-secondary product-edit-link" href="product-editor.html?id=${safeId}">تعديل</a>
              <button class="btn-danger" data-delete="${escapeHtml(product.id)}" type="button">حذف</button>
            `
          : '<span class="muted">الإضافة والتعديل والحذف متاحة بعد قبول الطلب.</span>';

        return `
          <article class="catalog-product-card" data-product-id="${escapeHtml(product.id)}">
            <div class="catalog-product-media">
              ${image ? `<img src="${safeImage}" alt="${safeName}" loading="lazy" />` : '<div class="catalog-no-image">بدون صورة</div>'}
            </div>
            <div class="catalog-product-body">
              <div class="catalog-product-head">
                <h3>${safeName}</h3>
                <div class="inline-actions">
                  <span class="pill">${safeCategory}</span>
                  <span class="pill">${escapeHtml(reviewStatusText)}</span>
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

    const canManageProducts = await ensureProductActionsAllowed(true);
    if (!canManageProducts) return;

    const productId = deleteBtn.getAttribute("data-delete");
    if (!productId) return;

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
    await loadProducts();
  }

  document.addEventListener("DOMContentLoaded", initProductsPage);
})();
