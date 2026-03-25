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
  const PRODUCT_IMAGE_FIELD_IDS = ["productImage1", "productImage2", "productImage3", "productImage4", "productImage5"];

  function safeText(value) {
    return String(value || "").trim();
  }

  function sanitizeTextInput(value, maxLength = 200) {
    return window.BudaSecurity?.sanitizeText
      ? window.BudaSecurity.sanitizeText(value, maxLength)
      : safeText(value).slice(0, maxLength);
  }

  function sanitizeImageInput(value) {
    // Do not truncate image URLs (especially data:image base64) to avoid
    // generating malformed values that trigger ERR_INVALID_URL.
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

  function updatePrimaryImagePreview(rawUrl = "") {
    const previewBox = document.getElementById("primaryImagePreviewBox");
    const previewImage = document.getElementById("primaryImagePreview");
    if (!previewBox || !previewImage) return;

    const safeUrl = sanitizeImageInput(rawUrl);
    if (!safeUrl) {
      previewImage.removeAttribute("src");
      previewBox.classList.add("hidden");
      return;
    }

    previewImage.src = safeUrl;
    previewBox.classList.remove("hidden");
  }

  function getFormPayload() {
    const imagesFromFields = PRODUCT_IMAGE_FIELD_IDS
      .map((id) => sanitizeImageInput(document.getElementById(id)?.value))
      .filter(Boolean);
    const legacyImagesText = safeText(document.getElementById("productImages")?.value);
    const imagesFromLegacyText = legacyImagesText
      .split(/[,\n;\|]+/g)
      .map((item) => sanitizeImageInput(item))
      .filter(Boolean);

    return {
      name: sanitizeTextInput(document.getElementById("productName")?.value, 200),
      category: sanitizeTextInput(document.getElementById("productCategory")?.value, 120),
      description: sanitizeTextInput(document.getElementById("productDescription")?.value, 1200),
      price: toNumber(document.getElementById("productPrice")?.value),
      discountPercent: toNumber(document.getElementById("productDiscount")?.value),
      quantity: toNumber(document.getElementById("productQuantity")?.value),
      phone: sanitizeTextInput(document.getElementById("productPhone")?.value, 30),
      images: imagesFromFields.length ? imagesFromFields : imagesFromLegacyText,
    };
  }

  function validateProduct(product) {
    if (!product.name || !product.category || !product.description) {
      return "يرجى تعبئة الاسم والتصنيف والوصف.";
    }
    if (product.price <= 0) return "السعر يجب أن يكون أكبر من صفر.";
    if (product.quantity < 0) return "الكمية غير صحيحة.";
    if (!Array.isArray(product.images) || !product.images.length) return "Please add a product image URL.";
    return "";
  }

  function resetForm() {
    const form = document.getElementById("productForm");
    if (!form) return;
    form.reset();
    state.editingId = "";
    updatePrimaryImagePreview("");
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
    const images = Array.isArray(product.images) ? product.images : [];
    document.getElementById("productImage1").value = images[0] || "";
    document.getElementById("productImage2").value = images[1] || "";
    document.getElementById("productImage3").value = images[2] || "";
    document.getElementById("productImage4").value = images[3] || "";
    document.getElementById("productImage5").value = images[4] || "";
    updatePrimaryImagePreview(images[0] || "");
    const legacyImagesInput = document.getElementById("productImages");
    if (legacyImagesInput) {
      legacyImagesInput.value = images.join(", ");
    }

    const submitBtn = document.querySelector('#productForm button[type="submit"]');
    if (submitBtn) submitBtn.textContent = "حفظ التعديل";
    document.getElementById("cancelEditBtn")?.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function getProductCardImage(product) {
    const raw = safeText(product.images?.[0] || "");
    return window.BudaSecurity?.sanitizeUrl
      ? window.BudaSecurity.sanitizeUrl(raw, { allowDataImages: true })
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
      if (String(error?.message || "") === "CLOUD_SYNC_REQUIRED") {
        notify("تم حفظ المنتج محليًا فقط ولم يتم حفظه في قاعدة البيانات. سجل الدخول بحساب Supabase ثم أعد المحاولة.", "error");
      } else {
        const backendMessage = String(error?.message || "").trim();
        if (backendMessage) {
          notify(backendMessage, "error");
        } else {
          notify("تعذر حفظ المنتج. تحقق من بنية الجدول في قاعدة البيانات.", "error");
        }
      }
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
    window.DashboardTopbarMenu?.mount?.({
      user,
      notify,
    });

    document.getElementById("productForm")?.addEventListener("submit", handleProductSubmit);
    document.getElementById("productsGrid")?.addEventListener("click", handleProductsGridClick);
    document.getElementById("cancelEditBtn")?.addEventListener("click", resetForm);
    document.getElementById("productImage1")?.addEventListener("input", (event) => {
      updatePrimaryImagePreview(event?.target?.value || "");
    });
    document.getElementById("primaryImagePreview")?.addEventListener("error", () => {
      updatePrimaryImagePreview("");
    });
    updatePrimaryImagePreview(document.getElementById("productImage1")?.value || "");
    await loadProducts();
  }

  document.addEventListener("DOMContentLoaded", initProductsPage);
})();

