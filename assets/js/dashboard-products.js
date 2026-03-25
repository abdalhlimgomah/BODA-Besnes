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

  function renderProducts() {
    const holder = document.getElementById("productsGrid");
    if (!holder) return;

    if (!state.products.length) {
      holder.innerHTML = `
        <article class="catalog-empty">
          <h3>لا توجد منتجات مضافة حتى الآن</h3>
          <p class="muted">ابدأ بإضافة أول منتج وسيظهر هنا بشكل احترافي.</p>
          <a class="btn-primary add-product-btn" href="product-editor.html">إضافة منتج جديد</a>
        </article>
      `;
      return;
    }

    holder.innerHTML = state.products
      .map((product) => {
        const image = getProductCardImage(product);
        const hasDiscount = toNumber(product.discountPercent) > 0;
        const finalPrice = hasDiscount
          ? product.price - (product.price * product.discountPercent) / 100
          : product.price;
        const safeId = encodeURIComponent(String(product.id || ""));
        const safeName = escapeHtml(product.name || "منتج بدون اسم");
        const safeCategory = escapeHtml(product.category || "غير مصنف");
        const safeQty = escapeHtml(toNumber(product.quantity));
        const safeDescription = escapeHtml(sanitizeTextInput(product.description || "", 180));
        const safeImage = escapeHtml(image);

        return `
          <article class="catalog-product-card" data-product-id="${escapeHtml(product.id)}">
            <div class="catalog-product-media">
              ${image ? `<img src="${safeImage}" alt="${safeName}" loading="lazy" />` : '<div class="catalog-no-image">بدون صورة</div>'}
            </div>
            <div class="catalog-product-body">
              <div class="catalog-product-head">
                <h3>${safeName}</h3>
                <span class="pill">${safeCategory}</span>
              </div>
              <p class="muted catalog-product-description">${safeDescription || "لا يوجد وصف لهذا المنتج."}</p>
              <div class="catalog-price-line">
                <span>${money.format(finalPrice)}</span>
                ${hasDiscount ? `<del>${money.format(toNumber(product.price))}</del>` : ""}
              </div>
              <small class="muted">الكمية المتاحة: ${safeQty}</small>
              <div class="inline-actions catalog-actions">
                <a class="btn-secondary" href="product-editor.html?id=${safeId}">تعديل</a>
                <button class="btn-danger" data-delete="${escapeHtml(product.id)}" type="button">حذف</button>
              </div>
            </div>
          </article>
        `;
      })
      .join("");
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
    const deleteBtn = event.target.closest("[data-delete]");
    if (!deleteBtn) return;

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
      notify("تعذر حذف المنتج.", "error");
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

    document.getElementById("productsGrid")?.addEventListener("click", handleProductsGridClick);
    await loadProducts();
  }

  document.addEventListener("DOMContentLoaded", initProductsPage);
})();
