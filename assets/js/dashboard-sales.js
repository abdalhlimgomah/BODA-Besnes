(() => {
  "use strict";

  const INVOICE_RATE = 0.05;
  const FIXED_TAX_PER_UNIT = 12;

  const money = new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const integer = new Intl.NumberFormat("ar-EG");

  const state = {
    allOrders: [],
    daysFilter: 7,
  };

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

  function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function notify(message, type = "error") {
    const holder = document.getElementById("salesStatus");
    if (!holder) return;
    holder.classList.remove("hidden", "error", "success", "info");
    holder.classList.add("status-note", type);
    holder.textContent = safeText(message);
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

  function parseOrderDate(value) {
    const stamp = Date.parse(value || "");
    return Number.isFinite(stamp) && stamp > 0 ? new Date(stamp) : null;
  }

  function inDaysRange(date, days) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
    if (!days || days <= 0) return true;
    const now = Date.now();
    const diff = now - date.getTime();
    return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
  }

  function getDeliveredOrdersByFilter() {
    return state.allOrders.filter((order) => {
      if (normalizeStatus(order.status) !== "delivered") return false;
      const orderDate = parseOrderDate(order.createdAt);
      return inDaysRange(orderDate, state.daysFilter);
    });
  }

  function aggregateSalesRows() {
    const rows = getDeliveredOrdersByFilter();
    const grouped = new Map();
    const salesDays = new Set();

    rows.forEach((order) => {
      const orderDate = parseOrderDate(order.createdAt);
      if (orderDate) {
        salesDays.add(orderDate.toISOString().slice(0, 10));
      }

      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach((item) => {
        const quantity = Math.max(1, toNumber(item.quantity));
        const lineTotal = toNumber(item.lineTotal);
        const price = toNumber(item.price);
        const lineRevenue = lineTotal > 0 ? lineTotal : quantity * price;
        const unitPrice = quantity > 0 ? lineRevenue / quantity : price;
        const itemName = safeText(item.name || "منتج");
        const itemKey = `${safeText(item.productId || "")}|${itemName.toLowerCase()}`;

        if (!grouped.has(itemKey)) {
          grouped.set(itemKey, {
            productId: safeText(item.productId || ""),
            name: itemName,
            quantity: 0,
            lineRevenue: 0,
          });
        }

        const target = grouped.get(itemKey);
        target.quantity += quantity;
        target.lineRevenue += lineRevenue;
        target.lastUnitPrice = unitPrice;
      });
    });

    const productRows = [...grouped.values()].map((row) => {
      const invoiceFee = row.lineRevenue * INVOICE_RATE;
      const customerTax = row.quantity * FIXED_TAX_PER_UNIT;
      const customerPay = row.lineRevenue + invoiceFee + customerTax;
      return {
        ...row,
        unitPrice: row.quantity > 0 ? row.lineRevenue / row.quantity : toNumber(row.lastUnitPrice),
        invoiceFee,
        customerTax,
        customerPay,
        merchantNet: row.lineRevenue,
      };
    });

    productRows.sort((a, b) => b.lineRevenue - a.lineRevenue);

    const totals = productRows.reduce(
      (acc, row) => {
        acc.quantity += row.quantity;
        acc.revenue += row.lineRevenue;
        acc.invoiceFee += row.invoiceFee;
        acc.tax += row.customerTax;
        acc.customerPay += row.customerPay;
        return acc;
      },
      {
        quantity: 0,
        revenue: 0,
        invoiceFee: 0,
        tax: 0,
        customerPay: 0,
      }
    );

    return {
      productRows,
      totals,
      salesDaysCount: salesDays.size,
    };
  }

  function renderKpis(summary) {
    document.getElementById("salesDaysCount").textContent = integer.format(summary.salesDaysCount);
    document.getElementById("salesRevenueTotal").textContent = money.format(summary.totals.revenue);
    document.getElementById("salesInvoiceFeeTotal").textContent = money.format(summary.totals.invoiceFee);
    document.getElementById("salesTaxTotal").textContent = money.format(summary.totals.tax);
    document.getElementById("salesCustomerPayTotal").textContent = money.format(summary.totals.customerPay);
  }

  function renderSalesRows(summary) {
    const holder = document.getElementById("salesRowsList");
    if (!holder) return;

    if (!summary.productRows.length) {
      holder.innerHTML = '<article class="catalog-empty"><h3>لا توجد مبيعات ضمن الفترة المحددة</h3><p class="muted">جرّب توسيع الفترة الزمنية لعرض نتائج أكثر.</p></article>';
      return;
    }

    holder.innerHTML = summary.productRows
      .map((row) => `
        <article class="sales-row-card">
          <div class="sales-row-main">
            <strong>${escapeHtml(row.name)}</strong>
            <small class="muted">كمية مباعة: ${integer.format(row.quantity)} وحدة</small>
          </div>
          <div class="sales-row-metrics">
            <span><small>السعر المتوسط</small><strong>${money.format(row.unitPrice)}</strong></span>
            <span><small>صافي البيع</small><strong>${money.format(row.lineRevenue)}</strong></span>
            <span><small>رسوم 5%</small><strong>${money.format(row.invoiceFee)}</strong></span>
            <span><small>ضريبة العميل</small><strong>${money.format(row.customerTax)}</strong></span>
          </div>
        </article>
      `)
      .join("");
  }

  function renderInvoices(summary) {
    const holder = document.getElementById("salesInvoiceList");
    if (!holder) return;

    if (!summary.productRows.length) {
      holder.innerHTML = '<p class="muted">لا توجد فواتير لعرضها حاليًا.</p>';
      return;
    }

    holder.innerHTML = summary.productRows
      .map((row) => `
        <article class="sales-invoice-card">
          <div class="sales-invoice-head">
            <h4>${escapeHtml(row.name)}</h4>
            <span class="pill">إجمالي عميل: ${money.format(row.customerPay)}</span>
          </div>
          <div class="sales-invoice-grid">
            <div><small>الكمية</small><strong>${integer.format(row.quantity)}</strong></div>
            <div><small>سعر المنتج</small><strong>${money.format(row.lineRevenue)}</strong></div>
            <div><small>رسوم الفاتورة 5%</small><strong>${money.format(row.invoiceFee)}</strong></div>
            <div><small>الضريبة الثابتة</small><strong>${money.format(row.customerTax)}</strong></div>
            <div><small>صافي البائع</small><strong>${money.format(row.merchantNet)}</strong></div>
            <div><small>المدفوع من العميل</small><strong>${money.format(row.customerPay)}</strong></div>
          </div>
        </article>
      `)
      .join("");
  }

  function render() {
    const summary = aggregateSalesRows();
    renderKpis(summary);
    renderSalesRows(summary);
    renderInvoices(summary);
  }

  function bindFilters() {
    document.querySelectorAll("[data-days]").forEach((chip) => {
      chip.addEventListener("click", () => {
        state.daysFilter = toNumber(chip.getAttribute("data-days"));
        document.querySelectorAll("[data-days]").forEach((node) => {
          node.classList.toggle("active", node === chip);
        });
        render();
      });
    });
  }

  async function loadOrders() {
    try {
      state.allOrders = await window.PartnerAPI.getPartnerOrders();
      render();
    } catch (error) {
      console.error("sales load orders error", error);
      notify("تعذر تحميل بيانات المبيعات.", "error");
    }
  }

  async function initSalesPage() {
    const user = await window.PartnerSession.requireAuth({ requirePartner: true });
    if (!user) return;

    window.PartnerSession.markActiveNav("sales");
    window.DashboardTopbarMenu?.mount?.({
      user,
      notify,
    });

    bindFilters();
    await loadOrders();
  }

  document.addEventListener("DOMContentLoaded", initSalesPage);
})();
