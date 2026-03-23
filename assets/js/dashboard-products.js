(() => {
  "use strict";

  const money = new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const state = {
    editingId: "",
    products: [],
    currentUser: null,
  };

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

  function clearNotify() {
    const holder = document.getElementById("productsStatus");
    if (!holder) return;
    holder.classList.add("hidden");
    holder.classList.remove("error", "success", "info");
    holder.textContent = "";
  }

  function setButtonLoading(button, loadingText, isLoading) {
    if (!button) return;
    if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent || "";
    button.disabled = Boolean(isLoading);
    button.textContent = isLoading ? loadingText : button.dataset.defaultText;
  }

  function getFormPayload() {
    const imagesText = safeText(document.getElementById("productImages")?.value);
    const sanitize = (value, maxLength = 200) =>
      window.BODASecurity?.sanitizeText
        ? window.BODASecurity.sanitizeText(value, maxLength)
        : safeText(value).slice(0, maxLength);
    return {
      name: sanitize(document.getElementById("productName")?.value, 200),
      category: sanitize(document.getElementById("productCategory")?.value, 120),
      description: sanitize(document.getElementById("productDescription")?.value, 1200),
      price: toNumber(document.getElementById("productPrice")?.value),
      discountPercent: toNumber(document.getElementById("productDiscount")?.value),
      quantity: toNumber(document.getElementById("productQuantity")?.value),
      phone: sanitize(document.getElementById("productPhone")?.value, 30),
      images: imagesText
        .split(/[,\n;\|]+/g)
        .map((item) => {
          const cleaned = sanitize(item, 1000);
          if (window.BODASecurity?.sanitizeUrl) {
            return window.BODASecurity.sanitizeUrl(cleaned, { allowDataImages: true });
          }
          return cleaned.replace(/^javascript:/i, "");
        })
        .filter(Boolean),
    };
  }

  function validateProduct(product) {
    if (!product.name || !product.category || !product.description) {
      return "يرجى تعبئة الاسم والتصنيف والوصف.";
    }
    if (product.price <= 0) return "السعر يجب أن يكون أكبر من صفر.";
    if (product.quantity < 0) return "الكمية غير صحيحة.";
    return "";
  }

  function resetForm() {
    const form = document.getElementById("productForm");
    if (!form) return;
    form.reset();
    state.editingId = "";
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = "إضافة المنتج";
    document.getElementById("cancelEditBtn")?.classList.add("hidden");
  }

  function startEdit(productId) {
    const product = state.products.find((item) => String(item.id) === String(productId));
    if (!product) return;

    state.editingId = String(product.id);
    document.getElementById("productName").value = product.name || "";
    document.getElementById("productCategory").value = product.category || "";
    document.getElementById("productDescription").value = product.description || "";
    document.getElementById("productPrice").value = product.price ?? "";
    document.getElementById("productDiscount").value = product.discountPercent ?? 0;
    document.getElementById("productQuantity").value = product.quantity ?? 0;
    document.getElementById("productPhone").value = product.phone || "";
    document.getElementById("productImages").value = Array.isArray(product.images) ? product.images.join(", ") : "";

    const submitBtn = document.querySelector('#productForm button[type="submit"]');
    if (submitBtn) submitBtn.textContent = "حفظ التعديل";
    document.getElementById("cancelEditBtn")?.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function getProductCardImage(product) {
    const raw = safeText(product.images?.[0] || "");
    return window.BODASecurity?.sanitizeUrl
      ? window.BODASecurity.sanitizeUrl(raw, { allowDataImages: true })
      : raw.replace(/^javascript:/i, "");
  }

  function renderProducts() {
    const holder = document.getElementById("productsGrid");
    if (!holder) return;

    if (!state.products.length) {
      holder.innerHTML =
        '<div class="section-card"><p class="muted">لا توجد منتجات مضافة حتى الآن.</p></div>';
      return;
    }

    holder.innerHTML = state.products
      .map((product) => {
        const image = getProductCardImage(product);
        const hasDiscount = toNumber(product.discountPercent) > 0;
        const finalPrice = hasDiscount
          ? product.price - (product.price * product.discountPercent) / 100
          : product.price;
        const safeId = escapeHtml(product.id);
        const safeName = escapeHtml(product.name);
        const safeCategory = escapeHtml(product.category);
        const safeQuantity = escapeHtml(product.quantity);
        const safeImage = escapeHtml(image);

        return `
          <article class="product-card">
            <div class="product-media">
              ${
                image
                  ? `<img src="${safeImage}" alt="${safeName}" loading="lazy" />`
                  : "<div></div>"
              }
            </div>
            <div class="product-body">
              <h3 class="product-title">${safeName}</h3>
              <span class="pill">${safeCategory}</span>
              <div class="price-line">
                <span>${money.format(finalPrice)}</span>
                ${hasDiscount ? `<del>${money.format(product.price)}</del>` : ""}
              </div>
              <small class="muted">الكمية: ${safeQuantity}</small>
              <div class="inline-actions">
                <button class="btn-secondary" data-edit="${safeId}" type="button">تعديل</button>
                <button class="btn-danger" data-delete="${safeId}" type="button">حذف</button>
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
      document.getElementById("productsCount").textContent = String(state.products.length);
    } catch (error) {
      console.error("load products error", error);
      notify("تعذر تحميل المنتجات.", "error");
    }
  }

  async function handleProductSubmit(event) {
    event.preventDefault();
    clearNotify();

    const form = event.currentTarget;
    const submitBtn = form.querySelector('button[type="submit"]');
    const payload = getFormPayload();
    const validationError = validateProduct(payload);
    if (validationError) {
      notify(validationError, "error");
      return;
    }

    setButtonLoading(submitBtn, "جارٍ الحفظ...", true);
    try {
      if (state.editingId) {
        await window.PartnerAPI.updateProduct(state.editingId, payload, state.currentUser);
        notify("تم تعديل المنتج بنجاح.", "success");
      } else {
        await window.PartnerAPI.insertProduct(payload, state.currentUser);
        notify("تمت إضافة المنتج بنجاح.", "success");
      }
      resetForm();
      await loadProducts();
    } catch (error) {
      console.error("save product error", error);
      notify("تعذر حفظ المنتج. تحقق من بنية الجدول في قاعدة البيانات.", "error");
    } finally {
      setButtonLoading(submitBtn, "", false);
    }
  }

  async function handleProductsGridClick(event) {
    const editBtn = event.target.closest("[data-edit]");
    if (editBtn) {
      startEdit(editBtn.getAttribute("data-edit"));
      return;
    }

    const deleteBtn = event.target.closest("[data-delete]");
    if (!deleteBtn) return;

    const productId = deleteBtn.getAttribute("data-delete");
    if (!productId) return;
    if (!window.confirm("هل تريد حذف هذا المنتج؟")) return;

    try {
      await window.PartnerAPI.deleteProduct(productId, state.currentUser);
      notify("تم حذف المنتج.", "success");
      await loadProducts();
      if (String(state.editingId) === String(productId)) {
        resetForm();
      }
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
    document.getElementById("currentUserLabel").textContent = user.email || "";

    document.getElementById("productForm")?.addEventListener("submit", handleProductSubmit);
    document.getElementById("productsGrid")?.addEventListener("click", handleProductsGridClick);
    document.getElementById("cancelEditBtn")?.addEventListener("click", resetForm);
    document.getElementById("logoutBtn")?.addEventListener("click", async () => {
      await window.PartnerSession.signOut();
      window.PartnerSession.goTo(window.APP_ROUTES.login);
    });

    await loadProducts();
  }

  document.addEventListener("DOMContentLoaded", initProductsPage);
})();

