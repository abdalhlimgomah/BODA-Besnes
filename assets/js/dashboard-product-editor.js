(() => {
  "use strict";

  const PRODUCT_IMAGE_FIELD_IDS = ["productImage1", "productImage2", "productImage3", "productImage4", "productImage5"];

  const state = {
    editingId: "",
    products: [],
    currentUser: null,
    partnerAccess: null,
    productActionsAllowed: true,
  };

  function safeText(value) {
    return String(value || "").trim();
  }

  function sanitizeTextInput(value, maxLength = 200) {
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

  function splitImageInput(value) {
    const text = safeText(value);
    if (!text) return [];

    if (/^data:image\//i.test(text)) {
      const safe = sanitizeImageInput(text);
      return safe ? [safe] : [];
    }

    return text
      .split(/[,\n;\|]+/g)
      .map((entry) => sanitizeImageInput(entry))
      .filter(Boolean);
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

  function disableEditorForm(message) {
    const form = document.getElementById("productForm");
    const cancelLink = document.getElementById("cancelEditLink");
    const submitBtn = document.getElementById("submitProductBtn");

    if (form) {
      form.querySelectorAll("input, textarea, select, button").forEach((field) => {
        field.disabled = true;
      });
    }
    if (cancelLink) {
      cancelLink.classList.add("hidden");
    }
    if (submitBtn) {
      submitBtn.textContent = "مغلق";
    }

    notify(message, "info");
  }

  function applyPartnerAccess(access) {
    if (!access?.exists) {
      state.productActionsAllowed = false;
      disableEditorForm("لا يمكنك إدارة المنتجات قبل إرسال طلب الشراكة.");
      return false;
    }

    if (access.normalizedStatus === "rejected") {
      state.productActionsAllowed = false;
      window.PartnerSession.goTo(window.APP_ROUTES.dashboardBlocked);
      return false;
    }

    if (access.normalizedStatus !== "approved") {
      state.productActionsAllowed = false;
      disableEditorForm("لا يمكنك إضافة أو تعديل المنتجات إلا بعد قبول طلب الشراكة.");
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

  function readImageValues() {
    const unique = new Set();

    PRODUCT_IMAGE_FIELD_IDS.forEach((id) => {
      const raw = document.getElementById(id)?.value || "";
      splitImageInput(raw).forEach((url) => unique.add(url));
    });

    return [...unique].slice(0, 5);
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

  function updateExtraImagePreview() {
    const grid = document.getElementById("extraImagePreviewGrid");
    if (!grid) return;
    const urls = readImageValues().slice(1);

    if (!urls.length) {
      grid.innerHTML = '<div class="muted editor-thumb-placeholder">أضف صورًا إضافية لعرضها هنا.</div>';
      return;
    }

    grid.innerHTML = urls
      .map((url, index) => `<figure class="editor-thumb"><img src="${url}" loading="lazy" alt="صورة إضافية ${index + 2}" /></figure>`)
      .join("");
  }

  function updateModeUI() {
    const isEditing = Boolean(state.editingId);
    const editorTitle = document.getElementById("editorTitle");
    const editorSubtitle = document.getElementById("editorSubtitle");
    const submitBtn = document.getElementById("submitProductBtn");
    const cancelLink = document.getElementById("cancelEditLink");

    if (editorTitle) editorTitle.textContent = isEditing ? "تعديل المنتج" : "إضافة منتج جديد";
    if (editorSubtitle) {
      editorSubtitle.textContent = isEditing
        ? "عدّل الصور والبيانات ثم احفظ التحديث."
        : "اكتب كل تفاصيل المنتج واربط حتى 5 صور بجودة واضحة.";
    }
    if (submitBtn) submitBtn.textContent = isEditing ? "حفظ التعديل" : "إضافة المنتج";
    if (cancelLink) cancelLink.classList.toggle("hidden", !isEditing);
  }

  function getFormPayload() {
    return {
      name: sanitizeTextInput(document.getElementById("productName")?.value, 200),
      category: sanitizeTextInput(document.getElementById("productCategory")?.value, 120),
      description: sanitizeTextInput(document.getElementById("productDescription")?.value, 1200),
      price: toNumber(document.getElementById("productPrice")?.value),
      discountPercent: toNumber(document.getElementById("productDiscount")?.value),
      quantity: toNumber(document.getElementById("productQuantity")?.value),
      phone: sanitizeTextInput(document.getElementById("productPhone")?.value, 30),
      images: readImageValues(),
    };
  }

  function validateProduct(product) {
    if (!product.name || !product.category || !product.description) {
      return "يرجى تعبئة الاسم والتصنيف والوصف.";
    }
    if (product.price <= 0) return "السعر يجب أن يكون أكبر من صفر.";
    if (product.quantity < 0) return "الكمية غير صحيحة.";
    if (!Array.isArray(product.images) || !product.images.length) return "أضف رابط صورة واحدة على الأقل.";
    return "";
  }

  function fillForm(product = {}) {
    document.getElementById("productName").value = product.name || "";
    document.getElementById("productCategory").value = product.category || "";
    document.getElementById("productDescription").value = product.description || "";
    document.getElementById("productPrice").value = product.price ?? "";
    document.getElementById("productDiscount").value = product.discountPercent ?? 0;
    document.getElementById("productQuantity").value = product.quantity ?? 1;
    document.getElementById("productPhone").value = product.phone || "";

    const images = Array.isArray(product.images) ? product.images : [];
    PRODUCT_IMAGE_FIELD_IDS.forEach((fieldId, index) => {
      const input = document.getElementById(fieldId);
      if (input) input.value = images[index] || "";
    });

    updatePrimaryImagePreview(images[0] || "");
    updateExtraImagePreview();
  }

  function resetForm() {
    const form = document.getElementById("productForm");
    if (!form) return;
    form.reset();
    state.editingId = "";
    updateModeUI();
    updatePrimaryImagePreview("");
    updateExtraImagePreview();
  }

  function readEditIdFromUrl() {
    const url = new URL(window.location.href);
    const value = safeText(url.searchParams.get("id"));
    return value || "";
  }

  async function loadProducts() {
    state.products = await window.PartnerAPI.getProductsForCurrentUser();
  }

  function findCurrentEditingProduct() {
    if (!state.editingId) return null;
    return state.products.find((item) => String(item.id) === String(state.editingId)) || null;
  }

  async function bindEditingFromUrl() {
    const urlEditId = readEditIdFromUrl();
    state.editingId = urlEditId;
    updateModeUI();
    if (!urlEditId) return;

    await loadProducts();
    const targetProduct = findCurrentEditingProduct();
    if (!targetProduct) {
      state.editingId = "";
      updateModeUI();
      notify("لم يتم العثور على المنتج المطلوب للتعديل.", "error");
      return;
    }

    fillForm(targetProduct);
  }

  async function handleProductSubmit(event) {
    event.preventDefault();
    clearNotify();

    const canManageProducts = await ensureProductActionsAllowed(true);
    if (!canManageProducts) return;

    const form = event.currentTarget || document.getElementById("productForm");
    if (!form) {
      notify("تعذر قراءة نموذج المنتج. أعد تحميل الصفحة ثم حاول مرة أخرى.", "error");
      return;
    }
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
        setTimeout(() => {
          window.location.href = "products.html";
        }, 500);
      } else {
        await window.PartnerAPI.insertProduct(payload, state.currentUser);
        notify("تمت إضافة المنتج بنجاح.", "success");
        resetForm();
      }
    } catch (error) {
      console.error("save product error", error);
      const errorCode = String(error?.message || "");

      if (errorCode === "PARTNER_REQUEST_REJECTED") {
        window.PartnerSession.goTo(window.APP_ROUTES.dashboardBlocked);
      } else if (errorCode === "PARTNER_NOT_APPROVED") {
        notify("لا يمكنك إضافة أو تعديل المنتجات إلا بعد قبول طلب الشراكة.", "error");
      } else if (errorCode === "PARTNER_PROFILE_REQUIRED") {
        notify("يجب إكمال طلب الشراكة أولًا قبل إدارة المنتجات.", "error");
      } else if (errorCode === "CLOUD_SYNC_REQUIRED") {
        notify("تم حفظ المنتج محليًا فقط ولم يتم حفظه في قاعدة البيانات. سجل الدخول بحساب Supabase ثم أعد المحاولة.", "error");
      } else {
        const backendMessage = safeText(error?.message || "");
        notify(backendMessage || "تعذر حفظ المنتج.", "error");
      }
    } finally {
      setButtonLoading(submitBtn, "", false);
    }
  }

  function bindImagePreviewEvents() {
    PRODUCT_IMAGE_FIELD_IDS.forEach((fieldId) => {
      document.getElementById(fieldId)?.addEventListener("input", () => {
        const images = readImageValues();
        updatePrimaryImagePreview(images[0] || "");
        updateExtraImagePreview();
      });
    });

    document.getElementById("primaryImagePreview")?.addEventListener("error", () => {
      updatePrimaryImagePreview("");
    });
  }

  async function initProductEditorPage() {
    const user = await window.PartnerSession.requireAuth({ requirePartner: true });
    if (!user) return;

    state.currentUser = user;
    window.PartnerSession.markActiveNav("product-editor");
    window.DashboardTopbarMenu?.mount?.({
      user,
      notify,
    });

    const canManageProducts = await ensureProductActionsAllowed(true);
    if (!canManageProducts) {
      bindImagePreviewEvents();
      updateExtraImagePreview();
      return;
    }

    document.getElementById("productForm")?.addEventListener("submit", handleProductSubmit);
    bindImagePreviewEvents();
    updateExtraImagePreview();

    try {
      await bindEditingFromUrl();
    } catch (error) {
      console.error("editor init error", error);
      notify("تعذر تحميل بيانات المنتج للتعديل.", "error");
    }
  }

  document.addEventListener("DOMContentLoaded", initProductEditorPage);
})();
