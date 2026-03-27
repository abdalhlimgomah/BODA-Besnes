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
    if (state.filter === "all") return state.all;
    return state.all.filter((order) => normalizeStatus(order.status) === state.filter);
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
      .map((order) => {
        const statusKey = normalizeStatus(order.status);
        const statusClass = `status-${statusKey}`;
        const items = Array.isArray(order.items) ? order.items : [];
        const computedTotal = order.total || items.reduce((sum, item) => sum + item.lineTotal, 0);
        const safeOrderId = escapeHtml(order.id);
        const safeDate = escapeHtml(formatDate(order.createdAt));
        const safeStatus = escapeHtml(statusLabel(statusKey));
        const safeCustomer = escapeHtml(order.customerName || order.customerEmail || "غير معروف");

        return `
          <article class="order-card">
            <div class="order-head">
              <div>
                <p class="order-id">طلب #${safeOrderId}</p>
                <p class="order-meta">${safeDate}</p>
              </div>
              <span class="status-badge ${statusClass}">${safeStatus}</span>
            </div>

            <div class="order-items">
              ${items
                .map(
                  (item) => `
                <div class="order-item-line">
                  <span>${escapeHtml(item.name)} × ${escapeHtml(item.quantity)}</span>
                  <strong>${money.format(item.lineTotal)}</strong>
                </div>
              `
                )
                .join("")}
            </div>

            <div class="order-summary">
              <div class="summary-box">
                <small class="muted">العميل</small>
                <strong>${safeCustomer}</strong>
              </div>
              <div class="summary-box">
                <small class="muted">الإجمالي</small>
                <strong>${money.format(computedTotal)}</strong>
              </div>
            </div>

            <div class="inline-actions" style="margin-top: 10px;">
              <select class="order-status-select" data-order-id="${safeOrderId}">
                <option value="pending" ${statusKey === "pending" ? "selected" : ""}>قيد المراجعة</option>
                <option value="preparing" ${statusKey === "preparing" ? "selected" : ""}>جاري التجهيز</option>
                <option value="shipped" ${statusKey === "shipped" ? "selected" : ""}>تم الشحن</option>
                <option value="delivered" ${statusKey === "delivered" ? "selected" : ""}>تم التسليم</option>
              </select>
            </div>
          </article>
        `;
      })
      .join("");
  }

  async function loadOrders() {
    try {
      state.all = await window.PartnerAPI.getPartnerOrders();
      renderStats();
      renderOrders();
    } catch (error) {
      console.error("load orders error", error);
      notify("تعذر تحميل الطلبات.", "error");
    }
  }

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
      const updated = await window.PartnerAPI.updateOrderStatus(orderId, nextStatus);
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
