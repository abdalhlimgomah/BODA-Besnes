(() => {
  "use strict";

  const state = {
    all: [],
    filter: "all",
  };

  const money = new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  function safeText(value) {
    return String(value || "").trim();
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

  function normalizeStatus(status) {
    const value = safeText(status).toLowerCase();
    if (!value) return "pending";
    if (value.includes("pending") || value.includes("مراج")) return "pending";
    if (value.includes("preparing") || value.includes("تجه")) return "preparing";
    if (value.includes("shipped") || value.includes("شحن")) return "shipped";
    if (value.includes("delivered") || value.includes("تسليم")) return "delivered";
    return "pending";
  }

  function statusLabel(key) {
    const labels = {
      pending: "قيد المراجعة",
      preparing: "جاري التجهيز",
      shipped: "تم الشحن",
      delivered: "تم التسليم",
    };
    return labels[key] || key;
  }

  function notify(message, type = "error") {
    const holder = document.getElementById("ordersStatus");
    if (!holder) return;
    holder.classList.remove("hidden", "error", "success", "info");
    holder.classList.add("status-note", type);
    holder.textContent = safeText(message);
  }

  function renderStats() {
    const total = state.all.length;
    const pending = state.all.filter((order) => normalizeStatus(order.status) === "pending").length;
    const delivered = state.all.filter((order) => normalizeStatus(order.status) === "delivered").length;
    const active = state.all.filter((order) => {
      const key = normalizeStatus(order.status);
      return key === "pending" || key === "preparing" || key === "shipped";
    }).length;

    document.getElementById("ordersTotal").textContent = String(total);
    document.getElementById("ordersActive").textContent = String(active);
    document.getElementById("ordersDelivered").textContent = String(delivered);
    document.getElementById("ordersPending").textContent = String(pending);
  }

  function getFilteredOrders() {
    var orders = state.filter === "all" ? state.all : state.all.filter(function(order) { return normalizeStatus(order.status) === state.filter; });
    return orders.slice().sort(function(a, b) {
      var aStatus = normalizeStatus(a.status);
      var bStatus = normalizeStatus(b.status);
      var aDelivered = aStatus === "delivered" ? 1 : 0;
      var bDelivered = bStatus === "delivered" ? 1 : 0;
      if (aDelivered !== bDelivered) return aDelivered - bDelivered;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }

  function formatDate(value) {
    const parsed = Date.parse(value || "");
    if (!parsed) return "غير متاح";
    return new Date(parsed).toLocaleString("ar-EG");
  }

  function renderOrders() {
    const list = document.getElementById("ordersList");
    if (!list) return;

    document.querySelectorAll("[data-filter]").forEach((chip) => {
      chip.classList.toggle("active", chip.getAttribute("data-filter") === state.filter);
    });

    const rows = getFilteredOrders();
    if (!rows.length) {
      list.innerHTML =
        '<article class="section-card"><p class="muted">لا توجد طلبات ضمن هذا الفلتر.</p></article>';
      return;
    }

    list.innerHTML = rows
      .map(function(order) {
        const statusKey = normalizeStatus(order.status);
        const statusClass = "status-" + statusKey;
        const items = Array.isArray(order.items) ? order.items : [];
        const computedTotal = order.total || items.reduce(function(sum, item) { return sum + item.lineTotal; }, 0);
        const safeOrderId = escapeHtml(order.id);
        const safeDate = escapeHtml(formatDate(order.createdAt));
        const safeStatus = escapeHtml(statusLabel(statusKey));
        const safeCustomer = escapeHtml(order.customerName || order.customerEmail || "غير معروف");
        const safePhone = escapeHtml(order.customerPhone || "");
        const safeAddress = escapeHtml(order.address || "");

        var itemsHtml = items.map(function(item) {
          var imgHtml = "";
          if (item.image) {
            imgHtml = '<img class="order-item-img" src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.name) + '" loading="lazy" onerror="this.style.display=\'none\'">';
          }
          return '<div class="order-item-line">' +
            imgHtml +
            '<div class="order-item-info">' +
            '<span class="order-item-name">' + escapeHtml(item.name) + '</span>' +
            '<span class="order-item-meta">' + escapeHtml(item.quantity) + ' × ' + money.format(item.price) + '</span>' +
            '</div>' +
            '<strong class="order-item-total">' + money.format(item.lineTotal) + '</strong>' +
            '</div>';
        }).join("");

        return '<article class="order-card">' +
          '<div class="order-head">' +
            '<div>' +
              '<p class="order-id">طلب #' + safeOrderId + '</p>' +
              '<p class="order-meta">' + safeDate + '</p>' +
            '</div>' +
            '<span class="status-badge ' + statusClass + '">' + safeStatus + '</span>' +
          '</div>' +
          '<div class="order-items">' + itemsHtml + '</div>' +
          '<div class="order-customer">' +
            '<div class="customer-line">' +
              '<span class="customer-icon">👤</span>' +
              '<span>' + safeCustomer + '</span>' +
            '</div>' +
            (safePhone ? '<div class="customer-line"><span class="customer-icon">📞</span><span dir="ltr">' + safePhone + '</span></div>' : "") +
            (safeAddress ? '<div class="customer-line"><span class="customer-icon">📍</span><span>' + safeAddress + '</span></div>' : "") +
          '</div>' +
          '<div class="order-footer">' +
            '<div class="order-total"><span class="total-label">الإجمالي</span><strong>' + money.format(computedTotal) + '</strong></div>' +
            '<select class="order-status-select" data-order-id="' + safeOrderId + '">' +
              '<option value="pending"' + (statusKey === "pending" ? " selected" : "") + '>قيد المراجعة</option>' +
              '<option value="preparing"' + (statusKey === "preparing" ? " selected" : "") + '>جاري التجهيز</option>' +
              '<option value="shipped"' + (statusKey === "shipped" ? " selected" : "") + '>تم الشحن</option>' +
              '<option value="delivered"' + (statusKey === "delivered" ? " selected" : "") + '>تم التسليم</option>' +
            '</select>' +
          '</div>' +
        '</article>';
      })
      .join("");
  }

  async function loadOrders() {
    try {
      var user = await window.PartnerSession.requireAuth({ requirePartner: true });
      var email = (user?.email || "").toLowerCase().trim();
      state.all = await window.PartnerAPI.getPartnerOrders(email || null);
      renderStats();
      renderOrders();
    } catch (error) {
      console.error("load orders error", error);
      notify("تعذر تحميل الطلبات.", "error");
    }
  }

  window.__debugPartnerOrders = async function() {
    var info = document.getElementById("debugInfo");
    if (!info) { info = document.createElement("pre"); info.id = "debugInfo"; info.style.cssText = "direction:ltr;background:#f0f0f0;padding:10px;margin:10px;border:1px solid #ccc;font-size:12px;white-space:pre-wrap;"; document.querySelector(".page-wrap")?.prepend(info); }
    info.textContent = "جاري التحميل...";
    try {
      var user = await window.PartnerSession.requireAuth({ requirePartner: true });
      var partnerEmail = (user?.email || "").toLowerCase().trim();
      var msg = "المستخدم: " + partnerEmail + "\n---\n";
      var c = window.PartnerAPI?.raw?.();
      if (!c) { info.textContent = msg + "خطأ: لا يوجد Supabase client"; return; }

      var allOrdersData = await c.from("orders").select("*").limit(100);
      msg += "آخر 20 طلب:\n";
      if (allOrdersData.error) { msg += "خطأ: " + allOrdersData.error.message + "\n"; }
      else if (Array.isArray(allOrdersData.data)) {
        allOrdersData.data.forEach(function(o) {
          try {
            var typeData = JSON.parse(o.type || "{}");
            var sellerInType = typeData.seller_email || "(لا يوجد)";
            msg += "\n" + o.id.slice(0,8) + " | عميل: " + (o.user_name||"") + " | إيميل الطلب: " + (o.email||"") + " | seller_email in type: " + sellerInType + " | product: " + (typeData.name||"") + " | السعر: " + (o.total_price||o.total||0);
          } catch(e) { msg += "\n" + o.id.slice(0,8) + " | type غير قابل للقراءة"; }
        });
      }
      msg += "\n\n---\nفحص seller_email في الـ type:\n";
      if (Array.isArray(allOrdersData.data)) {
        var matchedViaType = 0;
        allOrdersData.data.forEach(function(o) {
          try {
            var typeData = JSON.parse(o.type || "{}");
            var se = (typeData.seller_email || "").toLowerCase().trim();
            if (se && se === partnerEmail) {
              msg += "✅ " + o.id.slice(0,8) + " مطابق (seller_email في type = " + se + ")\n";
              matchedViaType++;
            }
          } catch(e) {}
        });
        if (!matchedViaType) msg += "❌ لا توجد طلبات بها seller_email مطابق\n";
      }
      msg += "---\n";
      var rawItems = await c.from("order_items").select("*").limit(5);
      msg += "أول 5 order_items:\n" + (rawItems.error ? "خطأ: " + rawItems.error.message : JSON.stringify(rawItems.data, null, 2)) + "\n---\n";
      var ownProducts = await window.PartnerAPI.getProductsForCurrentUser();
      var partnerIds = (Array.isArray(ownProducts) ? ownProducts : []).map(p => p.id).filter(Boolean);
      msg += "منتجات الشريك: " + (Array.isArray(ownProducts) ? ownProducts.length + "\n" + JSON.stringify(ownProducts.slice(0,3).map(p => ({id:p.id, name:p.name, email:p.email})), null, 2) : "لا توجد");
      msg += "\n---\n";
      console.log("dashboard-orders: about to call getPartnerOrders");
      var apiOrders = await window.PartnerAPI.getPartnerOrders();
      console.log("dashboard-orders: getPartnerOrders returned", apiOrders);
      msg += "\nPartnerAPI.getPartnerOrders(): " + (Array.isArray(apiOrders) ? apiOrders.length + "\n" + JSON.stringify(apiOrders.slice(0,5).map(function(o) { return {id:o.id, status:o.status, items:o.items?.length, customerEmail:o.customerEmail}; }), null, 2) : "0") + "\n---\n";
      var emailDirect = await c.from("orders").select("id,email,type").eq("email", partnerEmail).limit(5);
      msg += "\nأمر.where('email', partnerEmail):\n" + (emailDirect.error ? "خطأ: " + emailDirect.error.message : (Array.isArray(emailDirect.data) && emailDirect.data.length ? emailDirect.data.length + " نتيجة" : "0"));
      info.textContent = msg;
    } catch(e) { info.textContent = "خطأ: " + (e?.message || e); }
  };

  function bindFilters() {
    document.querySelectorAll("[data-filter]").forEach((chip) => {
      chip.addEventListener("click", () => {
        state.filter = chip.getAttribute("data-filter") || "all";
        renderOrders();
      });
    });
  }

  async function handleOrderStatusChange(event) {
    const select = event.target.closest(".order-status-select");
    if (!select) return;

    const orderId = select.getAttribute("data-order-id");
    const nextStatus = select.value;
    if (!orderId || !nextStatus) return;

    select.disabled = true;
    try {
      var updUser = await window.PartnerSession.requireAuth({ requirePartner: true });
      var updEmail = (updUser?.email || "").toLowerCase().trim();
      const updated = await window.PartnerAPI.updateOrderStatus(orderId, nextStatus, updEmail || null);
      if (!updated) throw new Error("ORDER_NOT_UPDATED");
      const target = state.all.find((order) => String(order.id) === String(orderId));
      if (target) target.status = nextStatus;
      renderStats();
      renderOrders();
      notify("تم تحديث حالة الطلب.", "success");
    } catch (error) {
      console.error("update order status error", error);
      notify("تعذر تحديث حالة الطلب.", "error");
    } finally {
      select.disabled = false;
    }
  }

  async function initOrdersPage() {
    const user = await window.PartnerSession.requireAuth({ requirePartner: true });
    if (!user) return;

    window.PartnerSession.markActiveNav("orders");
    window.DashboardTopbarMenu?.mount?.({
      user,
      notify,
    });

    bindFilters();
    document.getElementById("ordersList")?.addEventListener("change", handleOrderStatusChange);

    await loadOrders();
  }

  document.addEventListener("DOMContentLoaded", initOrdersPage);
})();
