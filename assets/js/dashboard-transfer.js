(() => {
  "use strict";

  var userEmail = null;
  var userName = null;
  var currentRequestId = null;
  var pollTimer = null;
  var isFormSubmitted = false;
  var pendingFiles = [];

  function p(v) { return String(v || "").trim(); }
  function g(id) { return document.getElementById(id); }

  function db() {
    return window.PartnerAPI && window.PartnerAPI.raw();
  }

  function notify(msg, type) {
    var el = g("transferStatus");
    if (!el) return;
    el.classList.remove("hidden", "error", "success", "info");
    el.classList.add("status-note", type || "info");
    el.textContent = p(msg);
  }

  function formatCurrency(v) {
    return new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", minimumFractionDigits: 2 }).format(v);
  }

  function loadAmount() {
    var params = new URLSearchParams(window.location.search);
    var amt = parseFloat(params.get("amount")) || 0;
    var el = g("transferAmount");
    if (el) el.textContent = formatCurrency(amt);
  }

  function loadStoreWallet() {
    var el = g("storeWalletNumber");
    if (!el) return;
    db().from("store_config").select("value").eq("key", "wallet_phone").maybeSingle().then(function(res) {
      el.textContent = (res.data && res.data.value) ? res.data.value : "01000000000";
    });
  }

  function showStatus(mode, title, desc, extraHtml) {
    var overlay = g("statusOverlay");
    var card = g("statusCard");
    var icon = g("statusIcon");
    var titleEl = g("statusTitle");
    var descEl = g("statusDesc");
    var extra = g("statusExtra");
    if (!overlay || !card) return;
    card.className = "status-card " + mode;
    icon.textContent = mode === "approved" ? "✅" : (mode === "rejected" ? "❌" : "⏳");
    if (mode === "pending") icon.innerHTML = '<span class="pulse-dot"></span>';
    titleEl.textContent = title || "";
    descEl.textContent = desc || "";
    extra.innerHTML = extraHtml || "";
    overlay.classList.add("show");
  }

  function checkLatestRequest() {
    if (!userEmail) return;
    db().from("transfer_requests").select("id,email,status,created_at,receipt_image1,receipt_image2,transfer_phone").eq("email", userEmail).order("created_at", { ascending: false }).limit(1).maybeSingle().then(function(res) {
      if (res.error || !res.data) return;
      var r = res.data;
      if (r.status === "approved") {
        g("transferFormSection")?.classList.add("past-payment");
        var banner = document.createElement("div");
        banner.className = "status-note success";
        banner.id = "pastPaymentBanner";
        banner.innerHTML = '● تم الدفع مسبقاً. يمكنك تقديم طلب دفع جديد.';
        g("transferFormSection")?.prepend(banner);
        stopPolling();
      } else if (r.status === "rejected") {
        showStatus("rejected", "تم رفض العملية ❌", "لم يتم تحويل الأموال إلى رقم المحفظة الرسمي. تم الكشف عن محاولة تلاعب. للاستفسار، يرجى التواصل مع الدعم.", '<div class="sc-warning" style="border-color:#ef5350;background:rgba(239,83,80,0.1);"><strong>⚠ تم الرفض:</strong> لم يتم استلام أي تحويل مالي على رقم المحفظة الرسمي. إرسال بيانات وهمية يعتبر انتهاكاً وقد يؤدي إلى حظر الحساب.</div>');
        stopPolling();
      } else if (r.status === "pending") {
        showStatus("pending", "قيد المراجعة", "تم استلام إيصالك، سيتم مراجعة الدفع وتأكيد الحساب خلال 24 ساعة", '<div class="sc-warning"><strong>⚠ تنبيه:</strong> في حال عدم تحويل الأموال وإرسال بيانات تالفة، قد يؤدي ذلك إلى حذف الحساب.</div>');
        currentRequestId = r.id;
        isFormSubmitted = true;
        hideFormSection();
        startPolling(r.id);
      }
    });
  }

  function hideFormSection() {
    var el = g("transferFormSection");
    if (el) el.style.display = "none";
  }

  function startPolling(requestId) {
    stopPolling();
    pollTimer = setInterval(function() {
      db().from("transfer_requests").select("status").eq("id", requestId).maybeSingle().then(function(res) {
        if (res.error || !res.data) return;
        var status = res.data.status;
        if (status === "approved") {
          showStatus("approved", "تم الدفع بنجاح ✅", "تم تأكيد استلام الدفع. حسابك الآن نشط بالكامل.");
          stopPolling();
        } else if (status === "rejected") {
          showStatus("rejected", "تم رفض العملية ❌", "لم يتم تحويل الأموال إلى رقم المحفظة الرسمي. تم الكشف عن محاولة تلاعب. للاستفسار، يرجى التواصل مع الدعم.", '<div class="sc-warning" style="border-color:#ef5350;background:rgba(239,83,80,0.1);"><strong>⚠ تم الرفض:</strong> لم يتم استلام أي تحويل مالي على رقم المحفظة الرسمي. إرسال بيانات وهمية يعتبر انتهاكاً وقد يؤدي إلى حظر الحساب.</div>');
          stopPolling();
        }
      });
    }, 10000);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function loadHistory() {
    if (!userEmail) return;
    var container = g("transferHistory");
    if (!container) return;
    container.innerHTML = '<div class="empty-state"><span class="es-icon">⏳</span><p>جاري التحميل...</p></div>';
    db().from("transfer_requests").select("id,email,status,created_at,transfer_phone").eq("email", userEmail).order("created_at", { ascending: false }).limit(20).then(function(res) {
      if (res.error) { container.innerHTML = '<div class="empty-state"><span class="es-icon">❌</span><p>خطأ في التحميل</p></div>'; return; }
      var rows = res.data;
      if (!rows || rows.length === 0) { container.innerHTML = '<div class="empty-state"><span class="es-icon">📋</span><p>لا توجد طلبات سابقة</p></div>'; return; }
      container.innerHTML = '<div class="history-list"></div>';
      var list = container.querySelector(".history-list");
      rows.forEach(function(r) {
        var row = document.createElement("div");
        row.className = "history-row";
        var sc = r.status === "approved" ? "approved" : (r.status === "rejected" ? "rejected" : "pending");
        var st = r.status === "approved" ? "مقبول" : (r.status === "rejected" ? "مرفوض" : "قيد المراجعة");
        var dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" }) : "-";
        row.innerHTML = '<div class="hr-left"><span class="hr-date">' + dateStr + '</span><span class="hr-phone">' + (r.transfer_phone ? "هاتف: " + p(r.transfer_phone) : "") + '</span></div><span class="hr-badge ' + sc + '">' + st + '</span>';
        list.appendChild(row);
      });
    });
  }

  function resizeToBlob(file, maxW, maxH, quality, cb) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var canvas = document.createElement("canvas");
        var w = img.width, h = img.height;
        if (w > maxW || h > maxH) {
          var r = Math.min(maxW / w, maxH / h);
          w = Math.round(w * r); h = Math.round(h * r);
        }
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(function(blob) {
          cb(blob, canvas.toDataURL("image/jpeg", quality));
        }, "image/jpeg", quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  var uploadInProgress = false;

  function uploadFile(file, idx, cb) {
    resizeToBlob(file, 800, 800, 0.7, function(blob, previewUrl) {
      var ext = "jpg";
      var fileName = "receipt_" + Date.now() + "_" + idx + "." + ext;
      var storageClient = db().storage ? db().storage : null;
      if (!storageClient) { cb(previewUrl, null); return; }
      storageClient.from("receipts").upload(fileName, blob, {
        contentType: "image/jpeg",
        cacheControl: "31536000",
        upsert: false
      }).then(function(res) {
        if (res.error) {
          cb(previewUrl, null);
          return;
        }
        var publicUrl = db().storage.from("receipts").getPublicUrl(fileName).data.publicUrl;
        cb(previewUrl, publicUrl);
      });
    });
  }

  function initUpload() {
    var dropArea = g("receiptDropArea");
    var input = g("receiptInput");
    var preview = g("receiptPreview");

    dropArea.addEventListener("click", function(e) {
      if (e.target.closest(".pg-remove")) return;
      input.click();
    });

    input.addEventListener("change", function() { handleFiles(input.files); });

    dropArea.addEventListener("dragover", function(e) { e.preventDefault(); dropArea.style.borderColor = "#0e7c66"; });
    dropArea.addEventListener("dragleave", function() { dropArea.style.borderColor = "#cbd5e1"; });
    dropArea.addEventListener("drop", function(e) { e.preventDefault(); dropArea.style.borderColor = "#cbd5e1"; handleFiles(e.dataTransfer.files); });

    function handleFiles(files) {
      if (!files || files.length === 0) return;
      var arr = Array.from(files).slice(0, 2);
      var total = pendingFiles.length + arr.length;
      if (total > 2) { notify("الحد الأقصى صورتين فقط", "error"); return; }
      arr.forEach(function(f) {
        resizeToBlob(f, 800, 800, 0.7, function(blob, previewUrl) {
          pendingFiles.push({ file: f, blob: blob, previewUrl: previewUrl });
          renderPreviews();
        });
      });
    }
  }

  function renderPreviews() {
    var preview = g("receiptPreview");
    var ph = g("receiptPlaceholder");
    if (!preview) return;
    preview.innerHTML = "";
    if (pendingFiles.length === 0) {
      preview.style.display = "";
      if (ph) ph.style.display = "";
      return;
    }
    preview.style.display = "flex";
    if (ph) ph.style.display = "none";
    pendingFiles.forEach(function(item, idx) {
      var wrap = document.createElement("div");
      wrap.className = "pg-item";
      wrap.innerHTML = '<img src="' + item.previewUrl + '" alt="إيصال ' + (idx + 1) + '" /><button type="button" class="pg-remove" data-idx="' + idx + '">✕</button>';
      wrap.querySelector(".pg-remove").addEventListener("click", function() {
        pendingFiles.splice(idx, 1);
        renderPreviews();
      });
      preview.appendChild(wrap);
    });
  }

  function uploadAllFiles(cb) {
    if (pendingFiles.length === 0) { cb([]); return; }
    var results = [];
    var done = 0;
    pendingFiles.forEach(function(item, idx) {
      uploadFile(item.file, idx, function(previewUrl, publicUrl) {
        results[idx] = publicUrl || previewUrl;
        done++;
        if (done === pendingFiles.length) cb(results);
      });
    });
  }

  async function initPage() {
    loadAmount();
    loadStoreWallet();

    var user = await window.PartnerSession.requireAuth({ requirePartner: true });
    if (!user) return;
    userEmail = user.email;
    userName = user.name || "";

    loadHistory();
    checkLatestRequest();
    initUpload();

    var form = g("transferForm");
    if (form) {
      form.addEventListener("submit", function(e) {
        e.preventDefault();
        var btn = g("submitReceiptBtn");
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الرفع...';

        var phone = p(g("transferPhone").value);
        var note = p(g("transferNote").value);
        var email = userEmail || "unknown@partner.com";

        if (!phone) { notify("يرجى إدخال رقم الهاتف", "error"); btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> إرسال الإيصال'; return; }
        if (pendingFiles.length === 0) { notify("يرجى إضافة صورة الإيصال", "error"); btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> إرسال الإيصال'; return; }

        uploadAllFiles(function(imageUrls) {
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';
          var record = {
            email: email,
            full_name: userName,
            phone: "",
            wallet_type: "electronic",
            transfer_phone: phone,
            notes: note,
            receipt_image1: imageUrls[0] || "",
            receipt_image2: imageUrls[1] || "",
            status: "pending"
          };

          db().from("transfer_requests").insert(record).then(function(res) {
            if (res.error) {
              notify("خطأ في الإرسال: " + res.error.message, "error");
              btn.disabled = false;
              btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> إرسال الإيصال';
              return;
            }
            isFormSubmitted = true;
            currentRequestId = res.data && res.data[0] && res.data[0].id;
            hideFormSection();
            showStatus("pending", "قيد المراجعة", "تم استلام إيصالك، سيتم مراجعة الدفع وتأكيد الحساب خلال 24 ساعة", '<div class="sc-warning"><strong>⚠ تنبيه:</strong> في حال عدم تحويل الأموال وإرسال بيانات تالفة، قد يؤدي ذلك إلى حذف الحساب.</div>');
            if (currentRequestId) startPolling(currentRequestId);
            loadHistory();
          });
        });
      });
    }
  }

  document.addEventListener("DOMContentLoaded", initPage);
})();
