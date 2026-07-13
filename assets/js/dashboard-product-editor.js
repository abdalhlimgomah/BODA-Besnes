(() => {
  "use strict";

  const MAX_IMAGES = 8;

  const state = {
    editingId: "",
    products: [],
    currentUser: null,
    partnerAccess: null,
    productActionsAllowed: true,
    selectedFiles: [],
    uploadedUrls: [],
    selectedVideo: null,
    uploadedVideoUrl: "",
  };

  function safeText(value) {
    return String(value || "").trim();
  }

  function sanitizeTextInput(value, maxLength = 200) {
    return window.BudaSecurity?.sanitizeText
      ? window.BudaSecurity.sanitizeText(value, maxLength)
      : safeText(value).slice(0, maxLength);
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

  function renderImagePreviews() {
    const grid = document.getElementById("imagePreviewGrid");
    if (!grid) return;

    var items = [];
    state.uploadedUrls.forEach(function(url, i) {
      items.push({ url: url, type: "url", idx: i });
    });
    state.selectedFiles.forEach(function(file, i) {
      items.push({ url: URL.createObjectURL(file), type: "file", idx: i });
    });

    if (!items.length) {
      grid.innerHTML = "";
      return;
    }

    grid.innerHTML = items
      .map(function(item, index) {
        var removeAttr = item.type === "file"
          ? 'data-remove-image="' + item.idx + '"'
          : 'data-remove-url="' + item.idx + '"';
        return '<div class="editor-upload-preview">' +
          '<img src="' + item.url + '" alt="صورة ' + (index + 1) + '" />' +
          '<button class="remove-btn" ' + removeAttr + ' type="button">&times;</button>' +
        '</div>';
      })
      .join("");
  }

  function handleImageSelect(files) {
    const remaining = MAX_IMAGES - state.selectedFiles.length;
    const allowed = Array.from(files).slice(0, remaining);
    if (allowed.length < files.length) {
      notify(`يمكنك اختيار ${MAX_IMAGES} صور كحد أقصى.`, "info");
    }
    state.selectedFiles.push(...allowed);
    renderImagePreviews();
  }

  function removeImage(index) {
    state.selectedFiles.splice(index, 1);
    renderImagePreviews();
  }

  async function uploadSelectedFiles() {
    const client = window.PartnerAPI?.raw?.();
    if (!client) {
      console.error("Supabase client not available");
      return [];
    }

    const urls = [];

    for (const file of state.selectedFiles) {
      try {
        const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: uploadError } = await client.storage.from("Buda").upload(fileName, file, { upsert: true });
        if (uploadError) {
          console.error("upload failed", uploadError);
          continue;
        }
        const { data } = client.storage.from("Buda").getPublicUrl(fileName);
        if (data?.publicUrl) urls.push(data.publicUrl);
      } catch (err) {
        console.error("upload exception", err);
      }
    }

    return urls;
  }

  async function uploadVideo(file) {
    const client = window.PartnerAPI?.raw?.();
    if (!client) return "";
    try {
      const fileName = `videos/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: uploadError } = await client.storage.from("Buda").upload(fileName, file, { upsert: true });
      if (uploadError) {
        console.error("video upload failed", uploadError);
        return "";
      }
      const { data } = client.storage.from("Buda").getPublicUrl(fileName);
      return data?.publicUrl || "";
    } catch (err) {
      console.error("video upload exception", err);
      return "";
    }
  }

  function renderVideoPreview() {
    const videoBox = document.getElementById("videoPreviewBox");
    const videoEl = document.getElementById("videoPreview");
    const uploadText = document.getElementById("videoUploadText");
    if (!videoBox || !videoEl) return;

    if (state.selectedVideo) {
      videoEl.src = URL.createObjectURL(state.selectedVideo);
      videoBox.classList.remove("hidden");
      if (uploadText) uploadText.textContent = "تغيير الفيديو";
    } else if (state.uploadedVideoUrl) {
      videoEl.src = state.uploadedVideoUrl;
      videoBox.classList.remove("hidden");
      if (uploadText) uploadText.textContent = "تغيير الفيديو";
    } else {
      videoEl.removeAttribute("src");
      videoBox.classList.add("hidden");
      if (uploadText) uploadText.textContent = "اضغط لاختيار فيديو من المعرض";
    }
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
        : "أدخل بيانات المنتج مع حتى 8 صور وفيديو من المعرض.";
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
      images: state.uploadedUrls,
      videoUrl: state.uploadedVideoUrl,
    };
  }

  function validateProduct(product) {
    if (!product.name || !product.category || !product.description) {
      return "يرجى تعبئة الاسم والتصنيف والوصف.";
    }
    if (product.price <= 0) return "السعر يجب أن يكون أكبر من صفر.";
    if (product.quantity < 0) return "الكمية غير صحيحة.";
    if (!state.selectedFiles.length && (!Array.isArray(product.images) || !product.images.length)) return "أضف صورة واحدة على الأقل.";
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
    state.uploadedUrls = images.slice();
    state.selectedFiles = [];
    state.uploadedVideoUrl = product.videoUrl || "";
    state.selectedVideo = null;
    renderImagePreviews();
    renderVideoPreview();
  }

  function resetForm() {
    const form = document.getElementById("productForm");
    if (!form) return;
    form.reset();
    state.editingId = "";
    state.selectedFiles = [];
    state.uploadedUrls = [];
    state.selectedVideo = null;
    state.uploadedVideoUrl = "";
    updateModeUI();
    renderImagePreviews();
    renderVideoPreview();
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
    updateModeUI();
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

    console.log("=== SAVE DEBUG ===", { editingId: state.editingId, currentUser: state.currentUser, uploadedUrls: state.uploadedUrls, uploadedVideoUrl: state.uploadedVideoUrl });
    setButtonLoading(submitBtn, "جارٍ رفع الصور...", true);
    try {
      if (state.selectedFiles.length) {
        notify("جارٍ رفع الصور إلى الخادم...", "info");
        var newUrls = await uploadSelectedFiles();
        if (!newUrls.length) {
          notify("فشل رفع الصور، تأكد من اتصالك وحاول مرة أخرى.", "error");
          return;
        }
        state.uploadedUrls.push.apply(state.uploadedUrls, newUrls);
      }

      if (state.selectedVideo) {
        notify("جارٍ رفع الفيديو...", "info");
        state.uploadedVideoUrl = await uploadVideo(state.selectedVideo);
      }

      payload.images = state.uploadedUrls;
      payload.videoUrl = state.uploadedVideoUrl;

      setButtonLoading(submitBtn, "جارٍ الحفظ...", true);
      if (state.editingId) {
        await window.PartnerAPI.updateProduct(state.editingId, payload, state.currentUser);
        notify("تم تعديل المنتج بنجاح.", "success");
        setTimeout(() => {
          window.location.href = "products.html";
        }, 500);
      } else {
        await window.PartnerAPI.insertProduct(payload, state.currentUser);
        notify("تمت إضافة المنتج بنجاح.", "success");
        setTimeout(function() {
          window.location.href = "products.html";
        }, 500);
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

  function bindImageUploadEvents() {
    const zone = document.getElementById("imageUploadZone");
    const input = document.getElementById("productImageInput");
    if (!zone || !input) return;

    zone.addEventListener("click", () => input.click());

    input.addEventListener("change", (event) => {
      if (event.target.files?.length) {
        handleImageSelect(event.target.files);
      }
      input.value = "";
    });

    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.style.borderColor = "#3b82f6";
      zone.style.background = "#eff6ff";
    });

    zone.addEventListener("dragleave", () => {
      zone.style.borderColor = "#cbd5e1";
      zone.style.background = "#f8fafc";
    });

    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.style.borderColor = "#cbd5e1";
      zone.style.background = "#f8fafc";
      if (e.dataTransfer.files?.length) {
        handleImageSelect(e.dataTransfer.files);
      }
    });

    document.getElementById("imagePreviewGrid")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-remove-image]");
      if (btn) {
        const index = parseInt(btn.getAttribute("data-remove-image"), 10);
        if (!isNaN(index)) removeImage(index);
        return;
      }
      const urlBtn = e.target.closest("[data-remove-url]");
      if (urlBtn) {
        const index = parseInt(urlBtn.getAttribute("data-remove-url"), 10);
        if (!isNaN(index) && index >= 0 && index < state.uploadedUrls.length) {
          state.uploadedUrls.splice(index, 1);
          renderImagePreviews();
        }
      }
    });

    // Video upload
    const videoZone = document.getElementById("videoUploadZone");
    const videoInput = document.getElementById("productVideoInput");
    if (videoZone && videoInput) {
      videoZone.addEventListener("click", () => videoInput.click());
      videoInput.addEventListener("change", (event) => {
        if (event.target.files?.length) {
          state.selectedVideo = event.target.files[0];
          state.uploadedVideoUrl = "";
          renderVideoPreview();
        }
        videoInput.value = "";
      });
    }

    document.getElementById("removeVideoBtn")?.addEventListener("click", () => {
      state.selectedVideo = null;
      state.uploadedVideoUrl = "";
      renderVideoPreview();
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
      bindImageUploadEvents();
      return;
    }

    document.getElementById("productForm")?.addEventListener("submit", handleProductSubmit);
    bindImageUploadEvents();

    try {
      await bindEditingFromUrl();
    } catch (error) {
      console.error("editor init error", error);
      notify("تعذر تحميل بيانات المنتج للتعديل.", "error");
    }
  }

  document.addEventListener("DOMContentLoaded", initProductEditorPage);
})();
