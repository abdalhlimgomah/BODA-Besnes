(() => {
  "use strict";

  const PRODUCT_TABLE_CANDIDATES = ["products", "my_products", "partner_products", "seller_products", "product"];
  const PRODUCT_REVIEW_TABLE_CANDIDATES = [
    "my_products",
    "partner_products",
    "seller_products",
    "product_reviews",
    "products_review",
    "products_reviews",
    "review_products",
    "partner_products_review",
    "seller_products_review",
    "merchant_products_review",
    "products_requests",
    "merchant_products_requests",
  ];
  const PRODUCT_ID_COLUMNS = ["id", "product_id", "legacy_my_products_id", "legacy_product_id", "product_uuid", "uuid"];
  const PRODUCT_OWNER_ID_COLUMNS = ["owner_id", "user_id", "seller_id"];
  const PRODUCT_OWNER_EMAIL_COLUMNS = ["owner_email", "seller_email", "email", "user_email"];
  const ORDER_TABLE_CANDIDATES = ["orders", "partner_orders", "seller_orders", "merchant_orders", "shop_orders", "orders_requests", "order"];
  const ORDER_ITEM_TABLE_CANDIDATES = ["order_items", "orders_items", "order_products", "orders_products", "order_details", "seller_order_items", "partner_order_items", "merchant_order_items", "order_item"];
  const ORDER_ID_COLUMNS = ["order_id", "orderid", "id"];
  const ORDER_OWNER_ID_COLUMNS = ["seller_id", "owner_id", "partner_id", "merchant_id", "vendor_id", "store_owner_id", "user_id"];
  const ORDER_OWNER_EMAIL_COLUMNS = ["seller_email", "owner_email", "partner_email", "merchant_email", "vendor_email", "seller_mail", "owner_mail", "customer_email", "user_email", "email"];
  const ORDER_ITEM_ORDER_ID_COLUMNS = ["order_id", "orderid", "parent_order_id", "id_order"];
  const ORDER_ITEM_PRODUCT_ID_COLUMNS = ["product_id", "item_id", "id_product", "productid", "legacy_my_products_id", "legacy_product_id", "product_uuid", "uuid", "id"];
  const ORDER_ITEM_NAME_COLUMNS = ["product_name", "product_title", "name", "title", "item_name"];
  const ORDER_ITEM_QTY_COLUMNS = ["quantity", "quantity_ordered", "qty", "count"];
  const ORDER_ITEM_PRICE_COLUMNS = ["price", "item_price", "price_each", "amount", "unit_price"];
  const ORDER_STATUS_COLUMNS = ["status", "order_status"];
  const PARTNER_OWNER_ID_COLUMNS = ["owner_id", "user_id", "seller_id", "partner_id", "merchant_id", "id_user"];
  const PARTNER_OWNER_EMAIL_COLUMNS = ["owner_email", "email", "user_email", "seller_email", "partner_email", "merchant_email", "mail"];
  const PARTNER_DATE_COLUMNS = ["updated_at", "created_at", "submitted_at", "requested_at", "createdAt", "updatedAt"];
  const LEGACY_USER_TABLE_CANDIDATES = ["users"];
  const LEGACY_USER_EMAIL_COLUMNS = ["email", "user_email", "owner_email", "mail"];
  const LEGACY_USER_EMAIL_SCAN_COLUMNS = ["email", "user_email", "owner_email", "mail"];
  const LEGACY_USER_PASSWORD_COLUMNS = ["password_hash", "password", "pass", "user_password", "passwordHash", "hashed_password"];
  const LEGACY_USER_NAME_COLUMNS = ["full_name", "name", "username", "owner_name"];
  const LEGACY_USER_PHONE_COLUMNS = ["phone", "mobile", "owner_phone", "phone_number"];
  const USER_TABLE_CANDIDATES = ["users"];
  const LOCAL_KEYS = Object.freeze({
    currentUser: "currentUser",
    profile: "local_profile_v1",
    profileAvatars: "local_profile_avatars_v1",
    partner: "local_partner_profile_v1",
    products: "local_products_v1",
    orders: "local_orders_v1",
  });
  const PROFILE_AVATAR_COLUMNS = ["avatar_url", "avatar", "profile_image", "photo_url", "image", "img"];

  const state = {
    client: null,
    availableProductTables: [],
    preferredInsertTable: "",
    reviewProductTable: "",
    availableOrderTables: [],
    availableOrderItemTables: [],
  };
  const IMAGE_COLUMN_HINTS = ["image", "img", "thumbnail", "images", "extra_links", "link"];
  const ADAPTIVE_MUTATION_MAX_ATTEMPTS = 32;

  function normalizeEmail(value) {
    return window.BudaSecurity?.normalizeEmail
      ? window.BudaSecurity.normalizeEmail(value)
      : String(value || "").trim().toLowerCase();
  }

  function safeText(value) {
    return String(value || "").trim();
  }

  function sanitizeImageSource(value) {
    const text = safeText(value);
    if (!text) return "";

    if (window.BudaSecurity?.sanitizeUrl) {
      return window.BudaSecurity.sanitizeUrl(text, { allowDataImages: true });
    }

    if (/^\s*javascript:/i.test(text)) return "";
    if (/^https?:\/\//i.test(text)) return text;
    if (/^blob:/i.test(text)) return text;

    const dataMatch = text.match(/^data:image\/[a-z0-9.+-]+(?:;[a-z0-9=:+-]+)*,(.+)$/i);
    if (dataMatch && String(dataMatch[1] || "").length >= 16) return text;
    return "";
  }

  function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function pickFirst(record, keys, fallback = "") {
    if (!record || typeof record !== "object") return fallback;
    for (const key of keys) {
      if (record[key] !== undefined && record[key] !== null && String(record[key]).trim() !== "") {
        return record[key];
      }
    }
    return fallback;
  }

  function cleanPayload(payload, options = {}) {
    const keepEmpty = Boolean(options.keepEmpty);
    return Object.fromEntries(
      Object.entries(payload || {}).filter(([, value]) => {
        if (value === undefined || value === null) return false;
        if (!keepEmpty && typeof value === "string" && value.trim() === "") return false;
        return true;
      })
    );
  }

  function readStorageJSON(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeStorageJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function readAvatarStore() {
    const raw = readStorageJSON(LOCAL_KEYS.profileAvatars, {});
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw;
  }

  function readLocalAvatarForEmail(email) {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail) return "";
    const store = readAvatarStore();
    return sanitizeImageSource(store[cleanEmail] || "");
  }

  function writeLocalAvatarForEmail(email, avatarUrl) {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail) return false;

    const store = readAvatarStore();
    const cleanAvatar = sanitizeImageSource(avatarUrl);
    if (cleanAvatar) {
      store[cleanEmail] = cleanAvatar;
    } else {
      delete store[cleanEmail];
    }
    return writeStorageJSON(LOCAL_KEYS.profileAvatars, store);
  }

  function pickProfileAvatar(record = null, email = "") {
    const fromRecord = sanitizeImageSource(pickFirst(record || {}, PROFILE_AVATAR_COLUMNS, ""));
    if (fromRecord) return fromRecord;
    return readLocalAvatarForEmail(email);
  }

  function readLocalSessionUser() {
    const user = readStorageJSON(LOCAL_KEYS.currentUser, null);
    if (!user || typeof user !== "object") return null;
    const email = normalizeEmail(user.email || "");
    const source = safeText(user.authSource || user.auth_source || "").toLowerCase();
    if (!email || source !== "local") return null;
    return {
      id: safeText(user.id || ""),
      email,
      name: safeText(user.name || user.full_name || ""),
      phone: safeText(user.phone || ""),
      avatar_url: sanitizeImageSource(user.avatar_url || user.avatarUrl || "") || readLocalAvatarForEmail(email),
      authSource: "local",
    };
  }

  function isLocalOwner(owner) {
    const source = safeText(owner?.authSource || owner?.auth_source || "").toLowerCase();
    if (source === "local") return true;
    const id = safeText(owner?.id || "");
    return id.startsWith("local-");
  }

  function syncLocalSessionUser(profile = {}) {
    const current = readLocalSessionUser();
    if (!current) return;

    const email = normalizeEmail(profile.email || current.email || "");
    const avatarUrl =
      sanitizeImageSource(profile.avatar_url || profile.avatar || profile.profile_image || profile.photo_url || "") ||
      readLocalAvatarForEmail(email);

    const next = {
      ...current,
      email: email || current.email,
      name: safeText(profile.full_name || profile.name || current.name),
      phone: safeText(profile.phone || current.phone),
      avatar_url: avatarUrl,
    };

    writeStorageJSON(LOCAL_KEYS.currentUser, next);
    if (next.email && avatarUrl) {
      writeLocalAvatarForEmail(next.email, avatarUrl);
    }
    localStorage.setItem("userFullName", next.name);
    localStorage.setItem("userPhone", next.phone);
  }

  function readLocalProducts() {
    const rows = readStorageJSON(LOCAL_KEYS.products, []);
    return Array.isArray(rows) ? rows : [];
  }

  function writeLocalProducts(rows) {
    writeStorageJSON(LOCAL_KEYS.products, Array.isArray(rows) ? rows : []);
  }

  function normalizeLocalProduct(product, owner, existing = null) {
    const now = new Date().toISOString();
    const price = toNumber(product.price);
    const discountPercent = toNumber(product.discountPercent);
    const quantity = toNumber(product.quantity);
    const finalPrice = discountPercent > 0 ? price - (price * discountPercent) / 100 : price;
    const images = mapInputImages(product.images);

    return {
      id: safeText(existing?.id || `local_${Date.now()}_${Math.floor(Math.random() * 10000)}`),
      sourceTable: "local_products",
      ownerId: safeText(owner.id || ""),
      name: safeText(product.name || existing?.name || ""),
      price,
      discountPercent,
      finalPrice,
      description: safeText(product.description || existing?.description || ""),
      quantity,
      category: safeText(product.category || existing?.category || ""),
      email: normalizeEmail(owner.email || existing?.email || ""),
      phone: safeText(product.phone || owner.phone || existing?.phone || ""),
      images,
      createdAt: safeText(existing?.createdAt || now),
      updatedAt: now,
      raw: existing?.raw || {},
    };
  }

  function sortProducts(items) {
    const rows = Array.isArray(items) ? items : [];
    rows.sort((a, b) => {
      const dateA = Date.parse(a.updatedAt || a.createdAt || "") || 0;
      const dateB = Date.parse(b.updatedAt || b.createdAt || "") || 0;
      if (dateA !== dateB) return dateB - dateA;
      return toNumber(b.id) - toNumber(a.id);
    });
    return rows;
  }

  function pickFirstText(record, keys, fallback = "") {
    return safeText(pickFirst(record, keys, fallback));
  }

  async function verifyLegacyPassword(inputPassword, storedPassword, email = "") {
    const plain = String(inputPassword || "");
    const stored = String(storedPassword || "");
    if (!plain || !stored) return false;

    if (window.BudaSecurity?.verifyPassword) {
      return window.BudaSecurity.verifyPassword(plain, stored, email);
    }

    return plain === stored;
  }

  function isMissingColumnError(error) {
    if (!error) return false;
    const msg = `${error.message || ""} ${error.details || ""}`.toLowerCase();
    const code = String(error.code || "").toLowerCase();
    return (
      error.code === "PGRST204" ||
      code === "42703" ||
      msg.includes("could not find the") ||
      (msg.includes("column") && msg.includes("does not exist"))
    );
  }

  function isMissingTableError(error) {
    if (!error) return false;
    const msg = `${error.message || ""} ${error.details || ""}`.toLowerCase();
    const code = String(error.code || "").toLowerCase();
    return code === "42p01" || error.code === "PGRST205" || msg.includes("relation") || msg.includes("does not exist");
  }

  function isFunctionNotFoundError(error) {
    if (!error) return false;
    const msg = `${error.message || ""} ${error.details || ""}`.toLowerCase();
    const code = String(error.code || "").toLowerCase();
    return error.code === "PGRST202" || code === "42883" || msg.includes("function") && msg.includes("does not exist");
  }

  function isAuthPermissionError(error) {
    if (!error) return false;
    const status = Number(error.status || 0);
    const code = String(error.code || "").toLowerCase();
    const msg = `${error.message || ""} ${error.details || ""}`.toLowerCase();
    return (
      status === 401 ||
      status === 403 ||
      code === "42501" ||
      msg.includes("unauthorized") ||
      msg.includes("permission denied") ||
      msg.includes("jwt")
    );
  }

  function isInvalidAuthCredentialsError(error) {
    if (!error) return false;
    const code = String(error.code || "").toLowerCase();
    const status = Number(error.status || 0);
    const msg = `${error.message || ""} ${error.details || ""}`.toLowerCase();
    return (
      code === "invalid_credentials" ||
      code === "invalid_grant" ||
      msg.includes("invalid login credentials") ||
      (status === 400 && msg.includes("invalid"))
    );
  }

  function isAuthUserAlreadyExistsError(error) {
    if (!error) return false;
    const code = String(error.code || "").toLowerCase();
    const msg = `${error.message || ""} ${error.details || ""}`.toLowerCase();
    return (
      code === "user_already_exists" ||
      msg.includes("already") ||
      msg.includes("registered") ||
      (msg.includes("email") && msg.includes("exists"))
    );
  }

  function isTypeMismatchError(error) {
    if (!error) return false;
    const code = String(error.code || "").toLowerCase();
    const msg = `${error.message || ""} ${error.details || ""}`.toLowerCase();
    return (
      code === "22p02" ||
      code === "42804" ||
      msg.includes("invalid input syntax for type") ||
      (msg.includes("is of type") && msg.includes("but expression is of type"))
    );
  }

  function isValueTooLongError(error) {
    if (!error) return false;
    const code = String(error.code || "").toLowerCase();
    const msg = `${error.message || ""} ${error.details || ""}`.toLowerCase();
    return code === "22001" || msg.includes("value too long for type");
  }

  function getErrorText(error) {
    return `${error?.message || ""} ${error?.details || ""}`.trim();
  }

  function extractMissingColumnName(error) {
    const text = getErrorText(error);
    if (!text) return "";

    const patterns = [
      /could not find the ['"]?([a-z0-9_]+)['"]? column/i,
      /column ['"]?([a-z0-9_]+)['"]? of relation/i,
      /column ['"]?([a-z0-9_]+)['"]? does not exist/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) return safeText(match[1]);
    }
    return "";
  }

  function omitColumnCaseInsensitive(payload, columnName) {
    const cleanColumn = safeText(columnName).toLowerCase();
    if (!cleanColumn) return payload;

    let removed = false;
    const next = {};
    Object.entries(payload || {}).forEach(([key, value]) => {
      if (String(key).toLowerCase() === cleanColumn) {
        removed = true;
        return;
      }
      next[key] = value;
    });

    return removed ? next : payload;
  }

  function isIntegerLike(value) {
    const text = safeText(value);
    return /^-?\d+$/.test(text);
  }

  function isUuidLike(value) {
    const text = safeText(value).toLowerCase();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text);
  }

  function reducePayloadByTypeMismatch(payload, error) {
    const base = payload && typeof payload === "object" ? payload : {};
    const text = getErrorText(error).toLowerCase();
    if (!text) return base;

    const quotedColumn =
      text.match(/column\s+['"]([a-z0-9_]+)['"]/i)?.[1] ||
      text.match(/column\s+([a-z0-9_]+)\s+/i)?.[1] ||
      "";

    if (quotedColumn) {
      return omitColumnCaseInsensitive(base, quotedColumn);
    }

    const expectsInteger =
      text.includes("type bigint") ||
      text.includes("type integer") ||
      text.includes("type smallint");
    const expectsUuid = text.includes("type uuid");
    if (!expectsInteger && !expectsUuid) return base;

    let removed = false;
    const next = {};
    Object.entries(base).forEach(([key, value]) => {
      const cleanKey = String(key || "").toLowerCase();
      const isIdKey = cleanKey === "id" || cleanKey.endsWith("_id");
      if (!isIdKey) {
        next[key] = value;
        return;
      }

      const textValue = safeText(value);
      if (!textValue) {
        next[key] = value;
        return;
      }

      if (expectsInteger && !isIntegerLike(textValue)) {
        removed = true;
        return;
      }
      if (expectsUuid && !isUuidLike(textValue)) {
        removed = true;
        return;
      }

      next[key] = value;
    });

    return removed ? next : base;
  }

  function scoreLargeValueColumn(columnName, value) {
    const key = String(columnName || "").toLowerCase();
    const rawValue = typeof value === "string" ? value : JSON.stringify(value || "");
    const text = String(rawValue || "");
    const isImageLike = IMAGE_COLUMN_HINTS.some((hint) => key.includes(hint));
    const isDataImage = /^data:image\//i.test(text);
    const isDescription = key.includes("description") || key === "desc";
    let score = text.length;
    if (isImageLike) score += 10000;
    if (isDataImage) score += 9000;
    if (isDescription) score += 400;
    return score;
  }

  function reducePayloadByValueLength(payload, error) {
    const base = payload && typeof payload === "object" ? payload : {};
    const text = getErrorText(error).toLowerCase();
    if (!text) return base;

    const quotedColumn =
      text.match(/column\s+['"]([a-z0-9_]+)['"]/i)?.[1] ||
      text.match(/column\s+([a-z0-9_]+)\s+/i)?.[1] ||
      "";
    if (quotedColumn) {
      return omitColumnCaseInsensitive(base, quotedColumn);
    }

    const candidates = Object.entries(base).filter(([, value]) => {
      if (typeof value === "string") return value.length > 240;
      if (Array.isArray(value)) return JSON.stringify(value).length > 240;
      return false;
    });
    if (!candidates.length) return base;

    const target = candidates
      .map(([key, value]) => ({ key, score: scoreLargeValueColumn(key, value) }))
      .sort((a, b) => b.score - a.score)[0];
    if (!target?.key) return base;

    return omitColumnCaseInsensitive(base, target.key);
  }

  function reducePayloadForGenericInsertError(payload) {
    const base = payload && typeof payload === "object" ? payload : {};
    const protect = new Set([
      "email",
      "owner_email",
      "seller_email",
      "user_email",
      "name",
      "product_name",
      "title",
      "price",
      "amount",
      "discount_percent",
      "discount",
      "price_after_discount",
      "final_price",
      "discounted_price",
      "sale_price",
      "description",
      "desc",
      "category",
      "store_category",
      "quantity",
      "stock",
      "image",
      "image_url",
      "image_link1",
      "img1",
      "image2",
      "image3",
      "image4",
      "image5",
      "img2",
      "img3",
      "img4",
      "img5",
      "image_link2",
      "image_link3",
      "image_link4",
      "image_link5",
      "images",
      "extra_links",
      "phone",
      "owner_phone",
      "phone_number",
      "mobile",
      "whatsapp",
      "updated_at",
    ]);

    const candidates = Object.entries(base).filter(([key]) => !protect.has(String(key || "").toLowerCase()));
    if (!candidates.length) return base;

    const target = candidates
      .map(([key, value]) => ({ key, score: scoreLargeValueColumn(key, value) }))
      .sort((a, b) => b.score - a.score)[0];
    if (!target?.key) return base;

    return omitColumnCaseInsensitive(base, target.key);
  }

  function isConflictTargetError(error) {
    const text = getErrorText(error).toLowerCase();
    return (
      text.includes("on conflict") ||
      text.includes("no unique or exclusion constraint") ||
      text.includes("no unique") ||
      text.includes("constraint matching the on conflict")
    );
  }

  function isUniqueViolationError(error) {
    if (!error) return false;
    const status = Number(error.status || 0);
    const code = String(error.code || "").toLowerCase();
    const text = getErrorText(error).toLowerCase();
    return (
      status === 409 ||
      code === "23505" ||
      text.includes("duplicate key value") ||
      text.includes("unique constraint")
    );
  }

  async function insertRowAdaptive(client, table, payload) {
    let candidate = cleanPayload(payload, { keepEmpty: true });
    let lastError = null;

    for (let attempt = 0; attempt < ADAPTIVE_MUTATION_MAX_ATTEMPTS; attempt += 1) {
      if (!Object.keys(candidate).length) break;

      const { data, error } = await client
        .from(table)
        .insert([candidate])
        .select("*");

      if (!error) {
        const row = Array.isArray(data) && data.length ? data[0] : data || candidate;
        return { ok: true, row };
      }

      lastError = error;
      if (isAuthPermissionError(error)) {
        return { ok: false, error };
      }

      if (isMissingColumnError(error)) {
        const badColumn = extractMissingColumnName(error);
        const next = omitColumnCaseInsensitive(candidate, badColumn);
        if (next === candidate) break;
        candidate = next;
        continue;
      }

      if (isTypeMismatchError(error)) {
        const next = reducePayloadByTypeMismatch(candidate, error);
        if (next === candidate) break;
        candidate = next;
        continue;
      }

      if (isValueTooLongError(error)) {
        const next = reducePayloadByValueLength(candidate, error);
        if (next === candidate) break;
        candidate = next;
        continue;
      }

      if (Number(error?.status || 0) === 400) {
        const next = reducePayloadForGenericInsertError(candidate);
        if (next !== candidate) {
          candidate = next;
          continue;
        }
      }

      break;
    }

    if (lastError) {
      console.warn("product insert adaptive failed", {
        table,
        status: Number(lastError?.status || 0) || undefined,
        code: safeText(lastError?.code || ""),
        message: safeText(lastError?.message || ""),
        details: safeText(lastError?.details || ""),
        hint: safeText(lastError?.hint || ""),
        payloadKeys: Object.keys(candidate || {}),
      });
    }
    return { ok: false, error: lastError || new Error("Insert failed.") };
  }

  async function upsertRowAdaptive(client, table, payload, conflictCandidates = []) {
    const conflicts = Array.from(
      new Set(
        (Array.isArray(conflictCandidates) ? conflictCandidates : [])
          .map((item) => safeText(item))
          .filter(Boolean)
      )
    );

    const orderedConflicts = conflicts.length
      ? conflicts
      : ["id", "email", "user_email", "owner_email"];

    let lastError = null;

    for (const onConflict of orderedConflicts) {
      let candidate = cleanPayload(payload, { keepEmpty: true });

      for (let attempt = 0; attempt < ADAPTIVE_MUTATION_MAX_ATTEMPTS; attempt += 1) {
        if (!Object.keys(candidate).length) break;

        const { data, error } = await client
          .from(table)
          .upsert(candidate, { onConflict })
          .select("*");

        if (!error) {
          const row = Array.isArray(data) && data.length ? data[0] : data || candidate;
          return { ok: true, row };
        }

        lastError = error;
        if (isAuthPermissionError(error)) {
          return { ok: false, error };
        }

        if (isMissingColumnError(error)) {
          const badColumn = extractMissingColumnName(error);
          const next = omitColumnCaseInsensitive(candidate, badColumn);
          if (next === candidate) break;
          candidate = next;
          continue;
        }

        if (isTypeMismatchError(error)) {
          const next = reducePayloadByTypeMismatch(candidate, error);
          if (next === candidate) break;
          candidate = next;
          continue;
        }

        if (isValueTooLongError(error)) {
          const next = reducePayloadByValueLength(candidate, error);
          if (next === candidate) break;
          candidate = next;
          continue;
        }

        if (Number(error?.status || 0) === 400) {
          const next = reducePayloadForGenericInsertError(candidate);
          if (next !== candidate) {
            candidate = next;
            continue;
          }
        }

        break;
      }

      if (!isConflictTargetError(lastError)) {
        break;
      }
    }

    const insertFallback = await insertRowAdaptive(client, table, payload);
    if (insertFallback.ok) return insertFallback;

    return { ok: false, error: insertFallback.error || lastError || new Error("Upsert failed.") };
  }

  function splitImages(value) {
    const raw = safeText(value);
    if (!raw) return [];
    if (/^data:image\//i.test(raw)) {
      const validData = sanitizeImageSource(raw);
      if (validData) return [validData];
    }

    return raw
      .split(/[,\n;\|]+/g)
      .map((item) => sanitizeImageSource(item))
      .filter(Boolean);
  }

  function collectImages(record) {
    const values = [
      pickFirst(record, ["image", "img1", "image1", "image_url", "image_link1", "img", "thumbnail"], ""),
      record.img2,
      record.img3,
      record.img4,
      record.img5,
      record.image2,
      record.image3,
      record.image4,
      record.image5,
      record.image_link2,
      record.image_link3,
      record.image_link4,
      record.image_link5,
      record.extra_links,
      record.images,
    ];

    const unique = new Set();
    values.forEach((value) => {
      if (Array.isArray(value)) {
        value.forEach((entry) => splitImages(entry).forEach((url) => unique.add(url)));
      } else {
        splitImages(value).forEach((url) => unique.add(url));
      }
    });

    return [...unique].slice(0, 5);
  }

  function mapInputImages(images) {
    if (Array.isArray(images)) {
      return images.map((item) => sanitizeImageSource(item)).filter(Boolean).slice(0, 5);
    }
    return splitImages(images).slice(0, 5);
  }

  async function resolveCloudOwnerForLocal(owner = {}) {
    const email = normalizeEmail(owner.email || "");
    if (!email) return { ...owner, id: safeText(owner.id || "") };

    const currentId = safeText(owner.id || "");
    const looksLocalId = currentId.startsWith("local-");
    if (currentId && !looksLocalId) {
      return { ...owner, id: currentId };
    }

    let resolvedId = "";
    try {
      const row = await getUserDirectoryByEmail(email);
      resolvedId = safeText(
        pickFirst(row, ["owner_id", "user_id", "seller_id", "id"], "")
      );
    } catch {
      resolvedId = "";
    }

    return {
      ...owner,
      id: resolvedId || "",
      email,
    };
  }

  async function resolveProductOwnerForInsert(owner = {}) {
    const email = normalizeEmail(owner.email || "");
    const next = {
      ...owner,
      id: safeText(owner.id || ""),
      email,
      name: safeText(owner.name || ""),
      phone: safeText(owner.phone || ""),
    };
    if (!email) return next;

    try {
      const row = await getUserDirectoryByEmail(email);
      if (!row || typeof row !== "object") return next;

      const rowId = safeText(pickFirst(row, ["owner_id", "user_id", "seller_id", "id"], ""));
      if (rowId && (isIntegerLike(rowId) || isUuidLike(rowId))) {
        next.id = rowId;
      }

      if (!next.name) {
        next.name = pickFirstText(row, LEGACY_USER_NAME_COLUMNS, "");
      }
      if (!next.phone) {
        next.phone = pickFirstText(row, LEGACY_USER_PHONE_COLUMNS, "");
      }
    } catch {
      // Ignore lookup failure and continue with the base owner values.
    }

    return next;
  }

  function getClient() {
    if (state.client) return state.client;

    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("Supabase library not loaded.");
    }

    state.client = window.supabase.createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
      },
    });

    return state.client;
  }

  async function resolveAvailableProductTables() {
    if (state.availableProductTables.length) return state.availableProductTables;

    const client = getClient();
    const available = [];

    for (const table of PRODUCT_TABLE_CANDIDATES) {
      const { error } = await client.from(table).select("*").limit(1);
      if (!error) {
        available.push(table);
        continue;
      }
      if (isMissingTableError(error)) continue;
      if (isAuthPermissionError(error)) continue;
    }

    if (!available.length) {
      throw new Error("No compatible product table was found in Supabase.");
    }

    state.availableProductTables = available;
    state.preferredInsertTable = available.includes("products") ? "products" : available[0];
    return available;
  }

  async function resolveReviewProductTable(primaryTable = "") {
    const cleanPrimary = safeText(primaryTable);
    if (state.reviewProductTable && state.reviewProductTable !== cleanPrimary) {
      return state.reviewProductTable;
    }

    const client = getClient();
    for (const table of PRODUCT_REVIEW_TABLE_CANDIDATES) {
      if (table === cleanPrimary) continue;
      const { error } = await client.from(table).select("*").limit(1);
      if (!error) {
        state.reviewProductTable = table;
        return table;
      }
    }

    state.reviewProductTable = "";
    return "";
  }

  async function resolveAvailableOrderTables() {
    if (state.availableOrderTables.length) return state.availableOrderTables;

    const client = getClient();
    const available = [];

    for (const table of ORDER_TABLE_CANDIDATES) {
      const { error } = await client.from(table).select("*").limit(1);
      if (!error) {
        available.push(table);
        continue;
      }
      if (isMissingTableError(error)) continue;
      if (isAuthPermissionError(error)) continue;
    }

    state.availableOrderTables = available;
    return available;
  }

  async function resolveAvailableOrderItemTables() {
    if (state.availableOrderItemTables.length) return state.availableOrderItemTables;

    const client = getClient();
    const available = [];

    for (const table of ORDER_ITEM_TABLE_CANDIDATES) {
      const { error } = await client.from(table).select("*").limit(1);
      if (!error) {
        available.push(table);
        continue;
      }
      if (isMissingTableError(error)) continue;
      if (isAuthPermissionError(error)) continue;
    }

    state.availableOrderItemTables = available;
    return available;
  }

  async function resolveProductTable() {
    await resolveAvailableProductTables();
    return state.preferredInsertTable;
  }

  async function getAuthSession() {
    const client = getClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data?.session || null;
  }

  async function getAuthUser() {
    const client = getClient();
    const { data, error } = await client.auth.getUser();
    if (error) {
      const msg = String(error.message || "").toLowerCase();
      if (msg.includes("auth session missing")) return null;
      throw error;
    }
    return data?.user || null;
  }

  function onAuthStateChange(callback) {
    const client = getClient();
    return client.auth.onAuthStateChange((event, session) => {
      if (typeof callback === "function") callback(event, session || null);
    });
  }

  async function authSignUp({ email, password, fullName = "", phone = "" }) {
    const client = getClient();
    const normalizedEmail = normalizeEmail(email);
    const plainPassword = String(password || "");

    if (!normalizedEmail || !plainPassword) {
      throw new Error("Email and password are required.");
    }

    const { data, error } = await client.auth.signUp({
      email: normalizedEmail,
      password: plainPassword,
      options: {
        data: cleanPayload({
          full_name: safeText(fullName),
          phone: safeText(phone),
        }),
      },
    });

    if (error) throw error;

    let session = data?.session || null;
    let user = data?.user || session?.user || null;

    return { user: user || null, session: session || null };
  }

  async function authSignIn({ email, password }) {
    const client = getClient();
    const normalizedEmail = normalizeEmail(email);
    const plainPassword = String(password || "");

    if (!normalizedEmail || !plainPassword) {
      throw new Error("Email and password are required.");
    }

    const { data, error } = await client.auth.signInWithPassword({
      email: normalizedEmail,
      password: plainPassword,
    });

    if (!error) {
      return {
        user: data?.user || null,
        session: data?.session || null,
      };
    }

    if (!isInvalidAuthCredentialsError(error)) throw error;

    // محاولة تعافٍ لحسابات قديمة موجودة في جدول users فقط.
    let legacyUser = null;
    try {
      legacyUser = await findLegacyUserForLogin({
        email: normalizedEmail,
        password: plainPassword,
      });
    } catch (legacyLookupError) {
      console.warn("legacy login lookup failed", legacyLookupError);
      throw error;
    }

    if (!legacyUser?.passwordVerified) throw error;

    const legacyName = safeText(legacyUser.name || "");
    const legacyPhone = safeText(legacyUser.phone || "");

    const { error: signUpError } = await client.auth.signUp({
      email: normalizedEmail,
      password: plainPassword,
      options: {
        data: cleanPayload({
          full_name: legacyName,
          phone: legacyPhone,
        }),
      },
    });

    if (signUpError && !isAuthUserAlreadyExistsError(signUpError)) {
      throw signUpError;
    }

    const { data: migratedData, error: migratedSignInError } = await client.auth.signInWithPassword({
      email: normalizedEmail,
      password: plainPassword,
    });

    if (migratedSignInError) throw migratedSignInError;

    const migratedUser = migratedData?.user || null;
    if (migratedUser) {
      const profilePayload = cleanPayload({
        email: normalizedEmail,
        full_name: legacyName,
        phone: legacyPhone,
        password: plainPassword,
      }, { keepEmpty: true });

      try {
        await upsertProfile(profilePayload, migratedUser);
      } catch (profileError) {
        console.warn("legacy profile upsert skipped", profileError);
      }

      try {
        await syncUserDirectoryRecord(profilePayload, {
          id: safeText(migratedUser.id),
          email: normalizedEmail,
          name: legacyName,
          phone: legacyPhone,
          authSource: "supabase",
        });
      } catch (directoryError) {
        console.warn("legacy user directory sync skipped", directoryError);
      }
    }

    return {
      user: migratedData?.user || null,
      session: migratedData?.session || null,
    };
  }

  async function findLegacyUserForLogin({ email, password }) {
    const normalizedEmail = normalizeEmail(email);
    const plainPassword = String(password || "");
    if (!normalizedEmail || !plainPassword) return null;

    const client = getClient();
    let firstLegacyRow = null;
    let sawPasswordField = false;

    for (const table of LEGACY_USER_TABLE_CANDIDATES) {
      for (const emailColumn of LEGACY_USER_EMAIL_COLUMNS) {
        const { data, error } = await client.from(table).select("*").ilike(emailColumn, normalizedEmail).limit(5);

        if (error) {
          if (isMissingTableError(error)) continue;

          if (isMissingColumnError(error)) {
            const fallback = await client.from(table).select("*").limit(200);
            if (fallback.error) continue;

            const rows = (Array.isArray(fallback.data) ? fallback.data : []).filter((row) => {
              const rowEmails = LEGACY_USER_EMAIL_SCAN_COLUMNS
                .map((key) => normalizeEmail(row?.[key]))
                .filter(Boolean);
              return rowEmails.includes(normalizedEmail);
            });

            if (!rows.length) continue;
            if (!firstLegacyRow) firstLegacyRow = { table, row: rows[0] };

            for (const row of rows) {
              const storedPassword = pickFirstText(row, LEGACY_USER_PASSWORD_COLUMNS, "");
              if (!storedPassword) continue;
              sawPasswordField = true;

              const isValidPassword = await verifyLegacyPassword(plainPassword, storedPassword, normalizedEmail);
              if (!isValidPassword) continue;

              return {
                table,
                row,
                email: normalizedEmail,
                name: pickFirstText(row, LEGACY_USER_NAME_COLUMNS, ""),
                phone: pickFirstText(row, LEGACY_USER_PHONE_COLUMNS, ""),
                passwordVerified: true,
              };
            }
            continue;
          }

          continue;
        }

        const rows = Array.isArray(data) ? data : [];
        if (!rows.length) continue;
        if (!firstLegacyRow) firstLegacyRow = { table, row: rows[0] };

        for (const row of rows) {
          const storedPassword = pickFirstText(row, LEGACY_USER_PASSWORD_COLUMNS, "");
          if (!storedPassword) continue;
          sawPasswordField = true;

          const isValidPassword = await verifyLegacyPassword(plainPassword, storedPassword, normalizedEmail);
          if (!isValidPassword) continue;

          return {
            table,
            row,
            email: normalizedEmail,
            name: pickFirstText(row, LEGACY_USER_NAME_COLUMNS, ""),
            phone: pickFirstText(row, LEGACY_USER_PHONE_COLUMNS, ""),
            passwordVerified: true,
          };
        }
      }
    }

    if (!firstLegacyRow) return null;
    if (sawPasswordField) return null;

    // If we found a legacy row without a readable password field, do not auto-migrate for safety.
    return {
      table: firstLegacyRow.table,
      row: firstLegacyRow.row,
      email: normalizedEmail,
      name: pickFirstText(firstLegacyRow.row, LEGACY_USER_NAME_COLUMNS, ""),
      phone: pickFirstText(firstLegacyRow.row, LEGACY_USER_PHONE_COLUMNS, ""),
      passwordVerified: false,
    };
  }

  async function authSignOut() {
    const client = getClient();
    const { error } = await client.auth.signOut();
    if (error) throw error;
    return true;
  }

  async function resolveOwnerContext(ownerInput = null) {
    if (ownerInput && typeof ownerInput === "object") {
      const ownerId = safeText(ownerInput.id);
      const ownerEmail = normalizeEmail(ownerInput.email || ownerInput.owner_email || ownerInput.user_email || "");
      const ownerSource = safeText(ownerInput.authSource || ownerInput.auth_source || "");
      if (ownerId || ownerEmail) {
        return {
          id: ownerId || "",
          email: ownerEmail || "",
          name: safeText(ownerInput.name || ownerInput.full_name || ""),
          phone: safeText(ownerInput.phone || ""),
          authSource: ownerSource || "",
        };
      }
    }

    if (typeof ownerInput === "string") {
      const ownerEmail = normalizeEmail(ownerInput);
      const localUser = readLocalSessionUser();
      if (localUser && normalizeEmail(localUser.email) === ownerEmail) {
        return {
          id: localUser.id,
          email: localUser.email,
          name: localUser.name,
          phone: localUser.phone,
          authSource: "local",
        };
      }
      return {
        id: "",
        email: ownerEmail,
        name: "",
        phone: "",
        authSource: "",
      };
    }

    const authUser = await getAuthUser();
    if (!authUser) {
      const localUser = readLocalSessionUser();
      if (localUser) {
        return {
          id: localUser.id,
          email: localUser.email,
          name: localUser.name,
          phone: localUser.phone,
          authSource: "local",
        };
      }
      return { id: "", email: "", name: "", phone: "", authSource: "" };
    }

    const metadata = authUser.user_metadata || {};
    const profile = await getProfileByUserId(authUser.id).catch(() => null);

    return {
      id: safeText(authUser.id),
      email: normalizeEmail(authUser.email || profile?.email || ""),
      name: safeText(profile?.full_name || metadata.full_name || ""),
      phone: safeText(profile?.phone || metadata.phone || ""),
      authSource: "supabase",
    };
  }

  async function getProfileByUserId(userId) {
    const cleanId = safeText(userId);
    if (!cleanId) return null;

    const client = getClient();
    const { data, error } = await client.from("profiles").select("*").eq("id", cleanId).maybeSingle();

    if (error) {
      if (isMissingTableError(error)) return null;
      throw error;
    }

    return data || null;
  }

  async function getUserDirectoryByEmail(email = "") {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return null;

    const client = getClient();
    const lookupColumns = ["email", "user_email", "owner_email", "mail"];

    for (const table of USER_TABLE_CANDIDATES) {
      let tableMissing = false;

      for (const column of lookupColumns) {
        const { data, error } = await client.from(table).select("*").eq(column, normalizedEmail).limit(1);
        if (!error) {
          const row = Array.isArray(data) && data.length ? data[0] : null;
          if (row) return row;
          continue;
        }

        if (isMissingTableError(error)) {
          tableMissing = true;
          break;
        }
        if (isMissingColumnError(error)) continue;
      }

      if (tableMissing) continue;

      const fallback = await client.from(table).select("*").limit(200);
      if (fallback.error) continue;

      const rows = Array.isArray(fallback.data) ? fallback.data : [];
      const match = rows.find((row) => {
        const emails = LEGACY_USER_EMAIL_SCAN_COLUMNS.map((key) => normalizeEmail(row?.[key])).filter(Boolean);
        return emails.includes(normalizedEmail);
      });
      if (match) return match;
    }

    return null;
  }

  async function getMyProfile() {
    const owner = await resolveOwnerContext();
    if (isLocalOwner(owner)) {
      const local = readStorageJSON(LOCAL_KEYS.profile, null);
      if (local && normalizeEmail(local.email || "") === normalizeEmail(owner.email)) {
        const localAvatar = pickProfileAvatar(local, owner.email);
        if (localAvatar) {
          writeLocalAvatarForEmail(owner.email, localAvatar);
        }
        return cleanPayload({
          ...local,
          avatar_url: localAvatar,
        }, { keepEmpty: true });
      }
      const fallbackAvatar = readLocalAvatarForEmail(owner.email);
      return cleanPayload({
        id: owner.id,
        email: owner.email,
        full_name: owner.name,
        phone: owner.phone,
        avatar_url: fallbackAvatar,
      }, { keepEmpty: true });
    }
    if (!owner.id) return null;

    const profile = await getProfileByUserId(owner.id);
    if (profile) {
      const profileEmail = normalizeEmail(profile.email || owner.email || "");
      const avatarUrl = pickProfileAvatar(profile, profileEmail);
      if (profileEmail && avatarUrl) {
        writeLocalAvatarForEmail(profileEmail, avatarUrl);
      }
      return cleanPayload({
        ...profile,
        avatar_url: avatarUrl,
      }, { keepEmpty: true });
    }

    if (!owner.email) return null;
    const userRow = await getUserDirectoryByEmail(owner.email);
    if (!userRow) return null;

    const fallbackAvatar = pickProfileAvatar(userRow, owner.email);
    if (fallbackAvatar) {
      writeLocalAvatarForEmail(owner.email, fallbackAvatar);
    }

    return cleanPayload({
      id: owner.id,
      email: normalizeEmail(pickFirst(userRow, LEGACY_USER_EMAIL_SCAN_COLUMNS, owner.email)),
      full_name: pickFirstText(userRow, LEGACY_USER_NAME_COLUMNS, owner.name),
      phone: pickFirstText(userRow, LEGACY_USER_PHONE_COLUMNS, owner.phone),
      avatar_url: fallbackAvatar,
    }, { keepEmpty: true });
  }

  async function syncUserDirectoryRecord(payload = {}, ownerInput = null) {
    const owner = await resolveOwnerContext(ownerInput);
    const email = normalizeEmail(payload.email || owner.email || "");
    if (!email) throw new Error("User email is required.");

    const existing = await getUserDirectoryByEmail(email).catch(() => null);
    if (existing) return existing;

    const ownerId = safeText(owner.id || "");
    const ownerIdNumeric = isIntegerLike(ownerId) ? ownerId : "";

    const fullName = safeText(payload.full_name || payload.name || owner.name || "");
    const phone = safeText(payload.phone || owner.phone || "");
    const plainPassword = String(payload.password || payload.plain_password || "");
    let passwordHash = safeText(payload.password_hash || "");

    if (!passwordHash && plainPassword && window.BudaSecurity?.hashPassword) {
      try {
        passwordHash = await window.BudaSecurity.hashPassword(plainPassword, email);
      } catch {
        passwordHash = "";
      }
    }
    if (!passwordHash && plainPassword) {
      passwordHash = plainPassword;
    }

    const now = new Date().toISOString();
    const basePayload = cleanPayload({
      id: ownerIdNumeric || undefined,
      user_id: ownerIdNumeric || undefined,
      owner_id: ownerIdNumeric || undefined,
      email,
      user_email: email,
      owner_email: email,
      full_name: fullName,
      name: fullName,
      username: fullName,
      phone,
      owner_phone: phone,
      phone_number: phone,
      password_hash: passwordHash,
      password: passwordHash,
      updated_at: now,
      created_at: now,
    }, { keepEmpty: true });

    const client = getClient();
    let lastError = null;

    for (const table of USER_TABLE_CANDIDATES) {
      const result = await upsertRowAdaptive(
        client,
        table,
        basePayload,
        ["id", "email", "user_email", "owner_email", "mail"]
      );

      if (result.ok) return result.row || basePayload;
      lastError = result.error || lastError;

      if (isUniqueViolationError(result.error)) {
        const matched = await getUserDirectoryByEmail(email).catch(() => null);
        if (matched) return matched;
      }

      if (isMissingTableError(result.error)) continue;
    }

    if (lastError) throw lastError;
    return null;
  }

  async function upsertProfile(payload = {}, ownerInput = null) {
    const owner = await resolveOwnerContext(ownerInput);

    const incomingAvatar = sanitizeImageSource(
      payload.avatar_url || payload.avatar || payload.profile_image || payload.photo_url || ""
    );

    if (isLocalOwner(owner)) {
      const fullName = safeText(payload.full_name || payload.name || owner.name || "");
      const phone = safeText(payload.phone || owner.phone || "");
      const email = normalizeEmail(payload.email || owner.email || "");
      const fallbackAvatar = incomingAvatar || readLocalAvatarForEmail(email);
      const localProfile = cleanPayload({
        id: owner.id || "local-admen788",
        email,
        full_name: fullName,
        phone,
        avatar_url: fallbackAvatar || undefined,
        updated_at: new Date().toISOString(),
      }, { keepEmpty: true });
      writeStorageJSON(LOCAL_KEYS.profile, localProfile);
      if (email && fallbackAvatar) {
        writeLocalAvatarForEmail(email, fallbackAvatar);
      }
      syncLocalSessionUser(localProfile);
      return localProfile;
    }
    if (!owner.id && !owner.email) throw new Error("Authenticated user is required to upsert profile.");

    const fullName = safeText(payload.full_name || payload.name || owner.name || "");
    const phone = safeText(payload.phone || owner.phone || "");
    const email = normalizeEmail(payload.email || owner.email || "");

    const base = cleanPayload({
      id: owner.id || undefined,
      email,
      full_name: fullName,
      phone,
      avatar_url: incomingAvatar || undefined,
      updated_at: new Date().toISOString(),
    }, { keepEmpty: true });

    const client = getClient();
    let profileRow = null;
    let profileError = null;

    if (owner.id) {
      const profileResult = await upsertRowAdaptive(client, "profiles", base, ["id", "email"]);
      if (profileResult.ok) {
        profileRow = profileResult.row || base;
      } else {
        profileError = profileResult.error || null;
      }
    }

    try {
      await syncUserDirectoryRecord({
        email,
        full_name: fullName,
        phone,
        password_hash: payload.password_hash,
        password: payload.password,
      }, owner);
    } catch (directoryError) {
      if (!profileRow) {
        throw directoryError;
      }
      console.warn("users sync skipped", directoryError);
    }

    if (email && incomingAvatar) {
      writeLocalAvatarForEmail(email, incomingAvatar);
    }

    if (profileRow) {
      const avatarUrl = pickProfileAvatar(profileRow, email) || incomingAvatar;
      if (email && avatarUrl) {
        writeLocalAvatarForEmail(email, avatarUrl);
      }
      return cleanPayload({
        ...profileRow,
        avatar_url: avatarUrl,
      }, { keepEmpty: true });
    }
    if (profileError && !isMissingTableError(profileError) && !isTypeMismatchError(profileError)) {
      throw profileError;
    }

    const fallbackAvatar = incomingAvatar || readLocalAvatarForEmail(email);
    if (email && fallbackAvatar) {
      writeLocalAvatarForEmail(email, fallbackAvatar);
    }

    return cleanPayload({
      id: owner.id || "",
      email,
      full_name: fullName,
      phone,
      avatar_url: fallbackAvatar || undefined,
      updated_at: new Date().toISOString(),
    }, { keepEmpty: true });
  }

  async function updateMyProfile(payload = {}) {
    const owner = await resolveOwnerContext();
    const avatarUrl = sanitizeImageSource(
      payload.avatar_url || payload.avatar || payload.profile_image || payload.photo_url || ""
    );
    if (owner.email && avatarUrl) {
      writeLocalAvatarForEmail(owner.email, avatarUrl);
    }

    return upsertProfile({
      full_name: payload.full_name || payload.name,
      phone: payload.phone,
      email: owner.email,
      avatar_url: avatarUrl,
    }, owner);
  }

  function normalizeProductReviewStatus(value, fallbackStatus = "") {
    const primary = safeText(value).toLowerCase().replace(/\s+/g, "_");
    const secondary = safeText(fallbackStatus).toLowerCase().replace(/\s+/g, "_");
    const probe = primary || secondary;
    if (!probe) return "pending";
    if (probe.includes("reviewed") || probe.includes("approved") || probe.includes("published") || probe.includes("قبول")) {
      return "reviewed";
    }
    if (probe.includes("rejected") || probe.includes("رفض")) return "rejected";
    if (probe.includes("pending") || probe.includes("draft") || probe.includes("review") || probe.includes("قيد") || probe.includes("مراج")) {
      return "pending";
    }
    return "pending";
  }

  function normalizeProduct(row, sourceTable) {
    const images = collectImages(row);
    const price = toNumber(pickFirst(row, ["price", "current_price", "amount"], 0));
    const discountPercent = toNumber(pickFirst(row, ["discount_percent", "discount"], 0));
    const quantity = toNumber(pickFirst(row, ["quantity", "stock"], 0));
    const reviewStatus = normalizeProductReviewStatus(
      pickFirst(row, ["review_status", "reviewStatus"], ""),
      pickFirst(row, ["status", "product_status"], "")
    );

    return {
      id: String(pickFirst(row, ["id", "product_id"], "")),
      sourceTable,
      ownerId: String(pickFirst(row, ["owner_id", "user_id", "seller_id"], "")),
      legacyMyProductId: safeText(pickFirst(row, ["legacy_my_products_id", "legacy_product_id", "my_product_id"], "")),
      name: safeText(pickFirst(row, ["product_name", "name", "title"], "")),
      price,
      discountPercent,
      finalPrice: discountPercent > 0 ? price - (price * discountPercent) / 100 : price,
      description: safeText(pickFirst(row, ["description", "desc"], "")),
      quantity,
      category: safeText(pickFirst(row, ["category", "store_category"], "")),
      email: normalizeEmail(pickFirst(row, ["owner_email", "seller_email", "email", "user_email"], "")),
      phone: safeText(pickFirst(row, ["phone", "owner_phone"], "")),
      reviewStatus,
      publicationStatus: safeText(pickFirst(row, ["status", "product_status"], "")),
      images,
      createdAt: pickFirst(row, ["created_at", "createdAt"], ""),
      updatedAt: pickFirst(row, ["updated_at", "updatedAt"], ""),
      raw: row,
    };
  }

  function rowBelongsToOwner(row, owner) {
    if (!row || !owner) return false;

    const ownerId = safeText(owner.id);
    if (ownerId) {
      const rowOwnerId = safeText(pickFirst(row, PRODUCT_OWNER_ID_COLUMNS, ""));
      if (rowOwnerId && rowOwnerId === ownerId) return true;
    }

    const ownerEmail = normalizeEmail(owner.email);
    if (!ownerEmail) return false;

    const rowEmails = PRODUCT_OWNER_EMAIL_COLUMNS.map((key) => normalizeEmail(row[key])).filter(Boolean);
    return rowEmails.includes(ownerEmail);
  }

  function rowBelongsToPartnerOwner(row, owner) {
    if (!row || !owner) return false;

    const ownerId = safeText(owner.id);
    if (ownerId) {
      const rowOwnerIds = PARTNER_OWNER_ID_COLUMNS.map((key) => safeText(row[key])).filter(Boolean);
      if (rowOwnerIds.includes(ownerId)) return true;
    }

    const ownerEmail = normalizeEmail(owner.email || "");
    if (!ownerEmail) return false;
    const rowEmails = PARTNER_OWNER_EMAIL_COLUMNS.map((key) => normalizeEmail(row[key])).filter(Boolean);
    return rowEmails.includes(ownerEmail);
  }

  function productMergeKey(product = {}) {
    const legacy = safeText(product.legacyMyProductId);
    if (legacy) return `legacy:${legacy}`;

    const id = safeText(product.id);
    const email = normalizeEmail(product.email || "");
    if (id && email) return `id-email:${id}|${email}`;
    if (id) return `id:${id}`;

    const name = safeText(product.name).toLowerCase();
    if (name && email) return `name-email:${name}|${email}`;
    return `${Math.random().toString(16).slice(2)}:${Date.now()}`;
  }

  function hasMeaningfulValue(value) {
    if (value === null || typeof value === "undefined") return false;
    if (typeof value === "string") return safeText(value).length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  }

  function productReviewStatusRank(value) {
    const key = normalizeProductReviewStatus(value);
    if (key === "reviewed") return 3;
    if (key === "pending") return 2;
    if (key === "rejected") return 1;
    return 0;
  }

  function mergeProductRecords(base, incoming) {
    if (!base) return incoming;
    if (!incoming) return base;

    const merged = { ...base };
    Object.entries(incoming).forEach(([key, value]) => {
      if (key === "raw") {
        if (hasMeaningfulValue(value)) merged.raw = value;
        return;
      }
      if (hasMeaningfulValue(value) || !hasMeaningfulValue(merged[key])) {
        merged[key] = value;
      }
    });

    if (productReviewStatusRank(incoming.reviewStatus) > productReviewStatusRank(base.reviewStatus)) {
      merged.reviewStatus = normalizeProductReviewStatus(incoming.reviewStatus);
    } else {
      merged.reviewStatus = normalizeProductReviewStatus(base.reviewStatus);
    }

    const baseUpdated = Date.parse(base.updatedAt || base.createdAt || "") || 0;
    const incomingUpdated = Date.parse(incoming.updatedAt || incoming.createdAt || "") || 0;
    if (incomingUpdated >= baseUpdated) {
      merged.updatedAt = incoming.updatedAt || incoming.createdAt || merged.updatedAt;
      merged.createdAt = incoming.createdAt || merged.createdAt;
    } else {
      merged.updatedAt = base.updatedAt || base.createdAt || merged.updatedAt;
      merged.createdAt = base.createdAt || merged.createdAt;
    }

    return merged;
  }

  function pickLatestPartnerRow(rows = []) {
    const list = Array.isArray(rows) ? rows.slice() : [];
    if (!list.length) return null;

    list.sort((a, b) => {
      const dateA = Date.parse(pickFirst(a, PARTNER_DATE_COLUMNS, "")) || 0;
      const dateB = Date.parse(pickFirst(b, PARTNER_DATE_COLUMNS, "")) || 0;
      if (dateA !== dateB) return dateB - dateA;

      const idA = safeText(pickFirst(a, ["id"], ""));
      const idB = safeText(pickFirst(b, ["id"], ""));
      const numA = Number(idA);
      const numB = Number(idB);
      if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) {
        return numB - numA;
      }
      return idB.localeCompare(idA);
    });

    return list[0] || null;
  }

  function shouldLookupPartnerByOwnerId(value = "") {
    const clean = safeText(value);
    if (!clean) return false;
    // Supabase auth ids are UUIDs. Skip local numeric/string ids to avoid 400 type mismatch queries.
    return isUuidLike(clean);
  }

  function normalizeOwnerIdForInsert(value = "") {
    const clean = safeText(value);
    if (!clean) return "";
    if (isUuidLike(clean) || isIntegerLike(clean)) return clean;
    return "";
  }

  function buildProductInsertPayloads(table, product, owner) {
    const images = mapInputImages(product.images);
    const firstImage = images[0] || "";
    const image2 = images[1] || "";
    const image3 = images[2] || "";
    const image4 = images[3] || "";
    const image5 = images[4] || "";
    const imagesText = images.join(", ");
    const extraLinks = images.slice(1).join(", ");
    const discountPercent = toNumber(product.discountPercent);
    const price = toNumber(product.price);
    const quantity = toNumber(product.quantity);
    const finalPrice = discountPercent > 0 ? price - (price * discountPercent) / 100 : price;
    const ownerId = normalizeOwnerIdForInsert(owner.id);
    const ownerEmail = normalizeEmail(owner.email || "");
    const ownerPhone = safeText(product.phone || owner.phone || "");
    const now = new Date().toISOString();
    const createdAt = now;

    const ownerFields = cleanPayload({
      owner_id: ownerId || undefined,
      seller_id: ownerId || undefined,
      user_id: ownerId || undefined,
      owner_email: ownerEmail,
      seller_email: ownerEmail,
      email: ownerEmail,
      user_email: ownerEmail,
    });

    const minimalPrimary = cleanPayload({
      ...ownerFields,
      name: product.name,
      price,
      description: product.description,
      category: product.category,
      quantity,
      image: firstImage,
      phone: ownerPhone,
      created_at: createdAt,
      updated_at: now,
    });

    const minimalAlternate = cleanPayload({
      ...ownerFields,
      product_name: product.name,
      title: product.name,
      amount: price,
      stock: quantity,
      desc: product.description,
      store_category: product.category,
      image_link1: firstImage,
      owner_phone: ownerPhone,
      created_at: createdAt,
      updated_at: now,
    });

    const rich = cleanPayload({
      ...ownerFields,
      name: product.name,
      product_name: product.name,
      title: product.name,
      price,
      amount: price,
      discount_percent: discountPercent,
      discount: discountPercent,
      price_after_discount: finalPrice,
      final_price: finalPrice,
      discounted_price: finalPrice,
      sale_price: finalPrice,
      quantity,
      stock: quantity,
      description: product.description,
      desc: product.description,
      category: product.category,
      store_category: product.category,
      image: firstImage,
      image_url: firstImage,
      image_link1: firstImage,
      img1: firstImage,
      image2,
      image3,
      image4,
      image5,
      img2: image2,
      img3: image3,
      img4: image4,
      img5: image5,
      image_link2: image2,
      image_link3: image3,
      image_link4: image4,
      image_link5: image5,
      extra_links: extraLinks,
      images,
      phone: ownerPhone,
      owner_phone: ownerPhone,
      phone_number: ownerPhone,
      mobile: ownerPhone,
      whatsapp: ownerPhone,
      created_at: createdAt,
      updated_at: now,
    });

    const richWithImagesText = imagesText ? cleanPayload({ ...rich, images: imagesText }) : null;

    // Try the fullest payload first so mirror/review tables receive all
    // important product fields whenever their schema supports them.
    const payloads = [];
    payloads.push(rich);
    if (richWithImagesText) payloads.push(richWithImagesText);
    payloads.push(minimalPrimary);
    payloads.push(minimalAlternate);

    const unique = [];
    const seen = new Set();
    payloads.forEach((payload) => {
      const key = JSON.stringify(payload || {});
      if (!key || seen.has(key)) return;
      seen.add(key);
      unique.push(payload);
    });

    return unique;
  }

  async function tryInsertProductToCloud(client, table, product, owner) {
    const payloads = buildProductInsertPayloads(table, product, owner);
    let lastError = null;

    for (const payload of payloads) {
      const candidates = [
        payload,
        cleanPayload({ ...payload, owner_id: undefined, seller_id: undefined, user_id: undefined }, { keepEmpty: true }),
      ];

      for (const candidate of candidates) {
        const result = await insertRowAdaptive(client, table, candidate);
        if (result.ok) return { ok: true };
        lastError = result.error || lastError;
      }
    }

    return { ok: false, error: lastError };
  }

  async function tryMirrorProductToReviewTable(client, primaryTable, product, owner) {
    const reviewTable = await resolveReviewProductTable(primaryTable);
    if (!reviewTable || reviewTable === primaryTable) return false;

    const mirror = await tryInsertProductToCloud(client, reviewTable, product, owner);
    if (!mirror.ok) {
      console.warn("product review mirror failed", {
        primaryTable,
        reviewTable,
        status: Number(mirror.error?.status || 0) || undefined,
        code: safeText(mirror.error?.code || ""),
        message: safeText(mirror.error?.message || ""),
        details: safeText(mirror.error?.details || ""),
      });
      return false;
    }

    return true;
  }

  async function trySyncLocalProductToCloud(product, owner) {
    if (!owner?.email) return false;

    let tables = [];
    try {
      tables = await resolveAvailableProductTables();
    } catch {
      return false;
    }
    if (!tables.length) return false;

    const preferred = state.preferredInsertTable && tables.includes(state.preferredInsertTable)
      ? state.preferredInsertTable
      : tables[0];
    const order = [preferred, ...tables.filter((table) => table !== preferred)];

    const client = getClient();
    const resolvedOwner = await resolveCloudOwnerForLocal(owner);
    const cloudOwnerBase = {
      ...resolvedOwner,
      id: safeText(resolvedOwner.id || "") || undefined,
      authSource: "local-cloud-sync",
    };
    const cloudOwner = await resolveProductOwnerForInsert(cloudOwnerBase);

    for (const table of order) {
      const result = await tryInsertProductToCloud(client, table, product, cloudOwner);
      if (result.ok) {
        state.preferredInsertTable = table;
        await tryMirrorProductToReviewTable(client, table, product, cloudOwner);
        return true;
      }
    }

    return false;
  }

  async function insertProduct(product, ownerInput = null) {
    const owner = await resolveOwnerContext(ownerInput);
    await assertPartnerApprovedForProductMutations(owner);
    if (isLocalOwner(owner)) {
      let synced = false;
      try {
        synced = await trySyncLocalProductToCloud(product, owner);
      } catch (error) {
        console.warn("local product cloud sync skipped", error);
      }

      if (!synced) {
        throw new Error("CLOUD_SYNC_REQUIRED");
      }

      // Keep a local mirror only after cloud save succeeds.
      const rows = readLocalProducts();
      const record = normalizeLocalProduct(product, owner);
      rows.push(record);
      writeLocalProducts(sortProducts(rows));
      return true;
    }
    const insertOwner = await resolveProductOwnerForInsert(owner);
    if (!insertOwner.email) throw new Error("Authenticated owner email is required.");

    const tables = await resolveAvailableProductTables();
    const preferred = state.preferredInsertTable && tables.includes(state.preferredInsertTable)
      ? state.preferredInsertTable
      : tables[0];
    const order = [preferred, ...tables.filter((table) => table !== preferred)];

    const client = getClient();
    let lastError = null;

    for (const table of order) {
      const payloads = buildProductInsertPayloads(table, product, insertOwner);
      for (const payload of payloads) {
        const candidates = [
          payload,
          cleanPayload({ ...payload, owner_id: undefined, seller_id: undefined, user_id: undefined }, { keepEmpty: true }),
        ];

        let inserted = false;
        for (const candidate of candidates) {
          const result = await insertRowAdaptive(client, table, candidate);
          if (!result.ok) {
            lastError = result.error || lastError;
            continue;
          }
          inserted = true;
          break;
        }

        if (inserted) {
          state.preferredInsertTable = table;
          await tryMirrorProductToReviewTable(client, table, product, insertOwner);
          return true;
        }
      }
    }

    throw lastError || new Error("Failed to insert product");
  }

  async function tryMutateProduct({ action, table, productId, payload, owner }) {
    const client = getClient();
    const candidates = [];

    if (owner.id) {
      PRODUCT_OWNER_ID_COLUMNS.forEach((ownerColumn) => {
        PRODUCT_ID_COLUMNS.forEach((idColumn) => {
          candidates.push({ idColumn, ownerColumn, ownerValue: owner.id });
        });
      });
    }

    if (owner.email) {
      PRODUCT_OWNER_EMAIL_COLUMNS.forEach((ownerColumn) => {
        PRODUCT_ID_COLUMNS.forEach((idColumn) => {
          candidates.push({ idColumn, ownerColumn, ownerValue: owner.email });
        });
      });
    }

    let lastError = null;
    for (const candidate of candidates) {
      let query = client.from(table);
      if (action === "update") {
        query = query.update(payload);
      } else {
        query = query.delete();
      }

      const { data, error } = await query
        .eq(candidate.idColumn, productId)
        .eq(candidate.ownerColumn, candidate.ownerValue)
        .select("*")
        .limit(1);

      if (error) {
        lastError = error;
        if (isMissingColumnError(error)) continue;
        continue;
      }

      if (Array.isArray(data) && data.length) return { done: true };
    }

    return { done: false, error: lastError };
  }

  function buildProductOwnerMatchCandidates(owner = {}) {
    const out = [];

    if (owner.id) {
      PRODUCT_OWNER_ID_COLUMNS.forEach((ownerColumn) => {
        out.push({ ownerColumn, ownerValue: owner.id });
      });
    }

    if (owner.email) {
      PRODUCT_OWNER_EMAIL_COLUMNS.forEach((ownerColumn) => {
        out.push({ ownerColumn, ownerValue: owner.email });
      });
    }

    const seen = new Set();
    return out.filter((item) => {
      const key = `${safeText(item.ownerColumn)}|${safeText(item.ownerValue)}`;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function rowHasKnownProductOwnerColumn(row) {
    if (!row || typeof row !== "object") return false;
    const known = new Set([...PRODUCT_OWNER_ID_COLUMNS, ...PRODUCT_OWNER_EMAIL_COLUMNS]);
    return Object.keys(row).some((key) => known.has(String(key || "").toLowerCase()));
  }

  async function findOwnedProductRowById(table, productId, owner = {}) {
    const client = getClient();
    const cleanProductId = safeText(productId);
    if (!cleanProductId) return { row: null, error: null };

    const ownerMatches = buildProductOwnerMatchCandidates(owner);
    let lastError = null;

    for (const match of ownerMatches) {
      for (const idColumn of PRODUCT_ID_COLUMNS) {
        const { data, error } = await client
          .from(table)
          .select("*")
          .eq(idColumn, cleanProductId)
          .eq(match.ownerColumn, match.ownerValue)
          .limit(1);

        if (error) {
          lastError = error;
          if (isMissingColumnError(error) || isTypeMismatchError(error)) continue;
          continue;
        }

        if (Array.isArray(data) && data.length) {
          return { row: data[0], error: null };
        }
      }
    }

    for (const idColumn of PRODUCT_ID_COLUMNS) {
      const { data, error } = await client
        .from(table)
        .select("*")
        .eq(idColumn, cleanProductId)
        .limit(5);

      if (error) {
        lastError = error;
        if (isMissingColumnError(error) || isTypeMismatchError(error)) continue;
        continue;
      }

      const rows = Array.isArray(data) ? data : [];
      const matched = rows.find((row) => {
        if (rowBelongsToOwner(row, owner)) return true;
        return !rowHasKnownProductOwnerColumn(row);
      });
      if (matched) return { row: matched, error: null };
    }

    return { row: null, error: lastError };
  }

  function buildProductDeleteFingerprint(row = {}) {
    const normalized = normalizeProduct(row, "");
    return {
      name: safeText(normalized.name || pickFirst(row, ["name", "product_name", "title"], "")),
      price: toNumber(normalized.price || pickFirst(row, ["price", "amount", "current_price"], 0)),
      firstImage: sanitizeImageSource(
        (Array.isArray(normalized.images) ? normalized.images[0] : "") ||
          pickFirst(row, ["image", "img1", "image1", "image_url", "image_link1", "img", "thumbnail"], "")
      ),
    };
  }

  async function runDeleteQueryByFingerprint({ table, ownerMatch, clauses }) {
    const client = getClient();
    let query = client.from(table).delete();

    if (ownerMatch?.ownerColumn && ownerMatch?.ownerValue) {
      query = query.eq(ownerMatch.ownerColumn, ownerMatch.ownerValue);
    }

    (Array.isArray(clauses) ? clauses : []).forEach((clause) => {
      if (!clause?.column) return;
      query = query.eq(clause.column, clause.value);
    });

    const { data, error } = await query.select("*").limit(50);
    if (error) {
      return { done: false, error };
    }

    return { done: Array.isArray(data) && data.length > 0, error: null };
  }

  async function tryDeleteProductByFingerprint({ table, owner, fingerprint }) {
    if (!table || !fingerprint) return { done: false, error: null };

    const ownerMatches = buildProductOwnerMatchCandidates(owner);
    if (!ownerMatches.length) return { done: false, error: null };

    const name = safeText(fingerprint.name);
    const price = toNumber(fingerprint.price);
    const firstImage = sanitizeImageSource(fingerprint.firstImage || "");
    if (!name && !firstImage) return { done: false, error: null };

    const nameColumns = ["name", "product_name", "title"];
    const priceColumns = ["price", "amount", "current_price", "final_price", "price_after_discount"];
    const imageColumns = ["image", "image_url", "image_link1", "img1"];

    let lastError = null;

    for (const ownerMatch of ownerMatches) {
      if (name) {
        for (const nameColumn of nameColumns) {
          const direct = await runDeleteQueryByFingerprint({
            table,
            ownerMatch,
            clauses: [{ column: nameColumn, value: name }],
          });
          if (direct.done) return direct;
          if (direct.error) {
            lastError = direct.error;
            if (isMissingColumnError(direct.error) || isTypeMismatchError(direct.error)) {
              continue;
            }
          }
        }
      }

      if (name && price > 0) {
        for (const nameColumn of nameColumns) {
          for (const priceColumn of priceColumns) {
            const withPrice = await runDeleteQueryByFingerprint({
              table,
              ownerMatch,
              clauses: [
                { column: nameColumn, value: name },
                { column: priceColumn, value: price },
              ],
            });
            if (withPrice.done) return withPrice;
            if (withPrice.error) {
              lastError = withPrice.error;
              if (isMissingColumnError(withPrice.error) || isTypeMismatchError(withPrice.error)) {
                continue;
              }
            }
          }
        }
      }

      if (firstImage) {
        for (const imageColumn of imageColumns) {
          const byImage = await runDeleteQueryByFingerprint({
            table,
            ownerMatch,
            clauses: [{ column: imageColumn, value: firstImage }],
          });
          if (byImage.done) return byImage;
          if (byImage.error) {
            lastError = byImage.error;
            if (isMissingColumnError(byImage.error) || isTypeMismatchError(byImage.error)) {
              continue;
            }
          }
        }
      }
    }

    return { done: false, error: lastError };
  }

  async function updateProduct(productId, product, ownerInput = null) {
    const owner = await resolveOwnerContext(ownerInput);
    await assertPartnerApprovedForProductMutations(owner);
    if (isLocalOwner(owner)) {
      const id = safeText(productId);
      const rows = readLocalProducts();
      const idx = rows.findIndex((item) => String(item.id) === id);
      if (idx < 0) throw new Error("Product not found or not owned by this user.");

      const existing = rows[idx];
      const ownerEmail = normalizeEmail(existing.email || owner.email || "");
      if (owner.email && ownerEmail && ownerEmail !== normalizeEmail(owner.email)) {
        throw new Error("Product not found or not owned by this user.");
      }

      rows[idx] = normalizeLocalProduct(product, owner, existing);
      writeLocalProducts(sortProducts(rows));
      return true;
    }
    if (!owner.id && !owner.email) throw new Error("Authenticated owner is required.");

    const tables = await resolveAvailableProductTables();
    const payloadByTable = new Map();
    tables.forEach((table) => {
      payloadByTable.set(table, buildProductInsertPayloads(table, product, owner));
    });

    let lastError = null;
    for (const table of tables) {
      const payloads = payloadByTable.get(table) || [];
      for (const payload of payloads) {
        const result = await tryMutateProduct({
          action: "update",
          table,
          productId,
          payload,
          owner,
        });

        if (result.done) return true;
        lastError = result.error || lastError;
      }
    }

    throw lastError || new Error("Product not found or not owned by this user.");
  }

  async function deleteProduct(productId, ownerInput = null) {
    const owner = await resolveOwnerContext(ownerInput);
    await assertPartnerApprovedForProductMutations(owner);
    if (isLocalOwner(owner)) {
      const id = safeText(productId);
      const rows = readLocalProducts();
      const filtered = rows.filter((item) => String(item.id) !== id);
      if (filtered.length === rows.length) throw new Error("Product not found or not owned by this user.");
      writeLocalProducts(filtered);
      return true;
    }
    if (!owner.id && !owner.email) throw new Error("Authenticated owner is required.");

    const tables = await resolveAvailableProductTables();
    const reviewTable = await resolveReviewProductTable(tables[0] || "");
    const allTables = Array.from(new Set([...tables, reviewTable].filter(Boolean)));
    const cleanProductId = safeText(productId);
    if (!cleanProductId) throw new Error("productId is required.");

    let sourceRow = null;
    let lastError = null;

    for (const table of allTables) {
      const probe = await findOwnedProductRowById(table, cleanProductId, owner);
      if (probe.row) {
        sourceRow = probe.row;
        break;
      }
      lastError = probe.error || lastError;
    }

    const fingerprint = sourceRow ? buildProductDeleteFingerprint(sourceRow) : null;
    let deletedAny = false;

    for (const table of allTables) {
      const result = await tryMutateProduct({
        action: "delete",
        table,
        productId: cleanProductId,
        payload: {},
        owner,
      });

      if (result.done) {
        deletedAny = true;
        continue;
      }
      lastError = result.error || lastError;

      if (!fingerprint) continue;
      const mirrored = await tryDeleteProductByFingerprint({
        table,
        owner,
        fingerprint,
      });
      if (mirrored.done) {
        deletedAny = true;
        continue;
      }
      lastError = mirrored.error || lastError;
    }

    if (deletedAny) {
      return true;
    }

    throw lastError || new Error("Product not found or not owned by this user.");
  }

  async function getProductsForOwner(ownerInput = null) {
    const owner = await resolveOwnerContext(ownerInput);
    if (isLocalOwner(owner)) {
      const email = normalizeEmail(owner.email || "");
      const rows = readLocalProducts().filter((item) => {
        const itemEmail = normalizeEmail(item.email || "");
        return !email || !itemEmail || itemEmail === email;
      });
      return sortProducts(rows);
    }
    if (!owner.id && !owner.email) return [];

    const tables = await resolveAvailableProductTables();
    const reviewTable = await resolveReviewProductTable(tables[0] || "");
    const allTables = Array.from(new Set([...tables, reviewTable].filter(Boolean)));
    const client = getClient();
    const mergedMap = new Map();

    for (const table of allTables) {
      const collectedRows = [];
      let lastError = null;
      let matchedQuery = false;

      const queries = [];
      if (owner.id) {
        PRODUCT_OWNER_ID_COLUMNS.forEach((column) => {
          queries.push(() => client.from(table).select("*").eq(column, owner.id));
        });
      }
      if (owner.email) {
        PRODUCT_OWNER_EMAIL_COLUMNS.forEach((column) => {
          queries.push(() => client.from(table).select("*").eq(column, owner.email));
        });
      }

      for (const run of queries) {
        const result = await run();
        if (!result.error) {
          matchedQuery = true;
          if (Array.isArray(result.data) && result.data.length) {
            collectedRows.push(...result.data);
          }
          continue;
        }
        const error = result.error;
        lastError = error;
        if (isMissingColumnError(error) || isTypeMismatchError(error) || isAuthPermissionError(error)) continue;
      }

      if (!matchedQuery) {
        const result = await client.from(table).select("*");
        if (!result.error) {
          if (Array.isArray(result.data) && result.data.length) {
            collectedRows.push(...result.data);
          }
        } else {
          const error = result.error;
          lastError = error;
          if (!isMissingColumnError(error) && !isTypeMismatchError(error) && !isAuthPermissionError(error)) {
            console.warn("getProductsForOwner fallback failed", {
              table,
              status: Number(error?.status || 0) || undefined,
              code: safeText(error?.code || ""),
              message: safeText(error?.message || ""),
            });
          }
        }
      }

      if (!collectedRows.length) {
        if (lastError && !isMissingColumnError(lastError) && !isTypeMismatchError(lastError) && !isAuthPermissionError(lastError)) {
          console.warn("getProductsForOwner query failed", {
            table,
            status: Number(lastError?.status || 0) || undefined,
            code: safeText(lastError?.code || ""),
            message: safeText(lastError?.message || ""),
          });
        }
        continue;
      }

      const dedupRows = [];
      const seenRowKeys = new Set();
      collectedRows.forEach((row) => {
        const key = JSON.stringify(row || {});
        if (!key || seenRowKeys.has(key)) return;
        seenRowKeys.add(key);
        dedupRows.push(row);
      });

      dedupRows
        .filter((row) => rowBelongsToOwner(row, owner))
        .forEach((row) => {
          const normalized = normalizeProduct(row, table);
          const key = productMergeKey(normalized);
          const existing = mergedMap.get(key);
          mergedMap.set(key, mergeProductRecords(existing, normalized));
        });
    }

    const out = Array.from(mergedMap.values());
    out.sort((a, b) => {
      const dateA = Date.parse(a.updatedAt || a.createdAt || "") || 0;
      const dateB = Date.parse(b.updatedAt || b.createdAt || "") || 0;
      if (dateA !== dateB) return dateB - dateA;
      return toNumber(b.id) - toNumber(a.id);
    });

    return out;
  }

  async function getProductsForCurrentUser() {
    const localUser = readLocalSessionUser();
    if (localUser) return getProductsForOwner(localUser);
    return getProductsForOwner();
  }

  async function hasPartnerProfile(ownerInput = null) {
    const owner = await resolveOwnerContext(ownerInput);
    if (!owner.id && !owner.email) return { exists: false, row: null };

    const localRow = readStorageJSON(LOCAL_KEYS.partner, null);
    if (localRow) {
      const ownerEmail = normalizeEmail(owner.email || "");
      const rowEmail = normalizeEmail(localRow.owner_email || localRow.email || "");
      if (ownerEmail && rowEmail && rowEmail === ownerEmail) {
        return { exists: true, row: localRow };
      }

      const ownerId = safeText(owner.id);
      if (ownerId) {
        const rowOwnerIds = PARTNER_OWNER_ID_COLUMNS.map((key) => safeText(localRow[key])).filter(Boolean);
        if (rowOwnerIds.includes(ownerId)) return { exists: true, row: localRow };
      }
    }

    const client = getClient();
    const attempts = [];

    if (owner.email) {
      attempts.push(() =>
        client
          .from("partners_requests")
          .select("*")
          .eq("owner_email", owner.email)
          .limit(50)
      );
      attempts.push(() =>
        client
          .from("partners_requests")
          .select("*")
          .eq("email", owner.email)
          .limit(50)
      );
    }

    if (shouldLookupPartnerByOwnerId(owner.id)) {
      attempts.push(() =>
        client
          .from("partners_requests")
          .select("*")
          .eq("owner_id", owner.id)
          .limit(50)
      );
    }

    let lastError = null;
    for (const run of attempts) {
      const { data, error } = await run();
      if (!error) {
        const rows = Array.isArray(data) ? data : [];
        const filtered = rows.filter((row) => rowBelongsToPartnerOwner(row, owner));
        const row = pickLatestPartnerRow(filtered);
        if (row) {
          writeStorageJSON(LOCAL_KEYS.partner, row);
          return { exists: true, row };
        }
        continue;
      }
      lastError = error;
      if (isMissingColumnError(error) || isTypeMismatchError(error) || isAuthPermissionError(error)) continue;
      if (isMissingTableError(error)) return { exists: false, row: null };
    }

    const fallback = await client.from("partners_requests").select("*").limit(1000);
    if (!fallback.error) {
      const rows = Array.isArray(fallback.data) ? fallback.data : [];
      const filtered = rows.filter((row) => rowBelongsToPartnerOwner(row, owner));
      const row = pickLatestPartnerRow(filtered);
      if (row) {
        writeStorageJSON(LOCAL_KEYS.partner, row);
        return { exists: true, row };
      }
      return { exists: false, row: null };
    }

    if (isMissingTableError(fallback.error) || isAuthPermissionError(fallback.error)) {
      return { exists: false, row: null };
    }

    if (lastError) {
      console.warn("partner profile lookup failed", {
        status: Number(lastError?.status || 0) || undefined,
        code: safeText(lastError?.code || ""),
        message: safeText(lastError?.message || ""),
      });
    }
    return { exists: false, row: null };
  }

  function normalizePartnerRequestStatus(value) {
    const key = safeText(value).toLowerCase().replace(/\s+/g, "_");
    if (!key) return "pending";
    if (key.includes("approved") || key.includes("قبول")) return "approved";
    if (key.includes("rejected") || key.includes("رفض")) return "rejected";
    if (key.includes("in_progress") || key.includes("under_review") || key.includes("processing") || key.includes("تنفيذ")) {
      return "in_progress";
    }
    if (key.includes("pending") || key.includes("قيد")) return "pending";
    return key;
  }

  async function assertPartnerApprovedForProductMutations(ownerInput = null) {
    const owner = await resolveOwnerContext(ownerInput);
    if (!owner?.id && !owner?.email) {
      throw new Error("Authenticated owner is required.");
    }

    const partner = await hasPartnerProfile(owner);
    if (!partner.exists || !partner.row) {
      throw new Error("PARTNER_PROFILE_REQUIRED");
    }

    const normalizedStatus = normalizePartnerRequestStatus(partner.row.status || "pending");
    if (normalizedStatus === "rejected") {
      throw new Error("PARTNER_REQUEST_REJECTED");
    }
    if (normalizedStatus !== "approved") {
      throw new Error("PARTNER_NOT_APPROVED");
    }
  }

  async function trySyncLocalPartnerToCloud(payload, owner) {
    if (!owner?.email) return null;

    const client = getClient();
    const basePayload = cleanPayload({
      ...payload,
      id: undefined,
      owner_id: undefined,
      owner_email: normalizeEmail(owner.email),
      email: normalizeEmail(owner.email),
      owner_name: safeText(payload.owner_name || owner.name || ""),
      owner_phone: safeText(payload.owner_phone || owner.phone || ""),
      updated_at: new Date().toISOString(),
    }, { keepEmpty: true });

    const candidates = [
      basePayload,
      cleanPayload({ ...basePayload, updated_at: undefined }, { keepEmpty: true }),
    ];

    for (const candidate of candidates) {
      const { data, error } = await client
        .from("partners_requests")
        .insert([candidate])
        .select("*");

      if (!error) {
        return Array.isArray(data) && data.length ? data[0] : null;
      }
    }

    return null;
  }

  async function savePartnerRequest(payload = {}, ownerInput = null) {
    const owner = await resolveOwnerContext(ownerInput);
    if (!owner.email) throw new Error("Authenticated user email is required.");

    if (isLocalOwner(owner)) {
      const existingLocal = await hasPartnerProfile(owner);
      if (existingLocal.exists) return existingLocal;

      const now = new Date().toISOString();
      const localRow = cleanPayload({
        id: `local_partner_${Date.now()}`,
        ...payload,
        owner_id: owner.id || "local-admen788",
        owner_email: owner.email,
        email: owner.email,
        owner_name: safeText(payload.owner_name || owner.name || ""),
        owner_phone: safeText(payload.owner_phone || owner.phone || ""),
        status: safeText(payload.status || "pending"),
        created_at: now,
        updated_at: now,
      }, { keepEmpty: true });

      writeStorageJSON(LOCAL_KEYS.partner, localRow);

      try {
        await trySyncLocalPartnerToCloud(localRow, owner);
      } catch (error) {
        console.warn("local partner cloud sync skipped", error);
      }
      return { exists: false, row: localRow };
    }

    const existing = await hasPartnerProfile(owner);
    if (existing.exists) return { exists: true, row: existing.row };

    const basePayload = cleanPayload({
      ...payload,
      owner_id: owner.id,
      owner_email: owner.email,
      email: owner.email,
      owner_name: safeText(payload.owner_name || owner.name || ""),
      owner_phone: safeText(payload.owner_phone || owner.phone || ""),
      status: safeText(payload.status || "pending"),
      updated_at: new Date().toISOString(),
    }, { keepEmpty: true });

    const candidates = [
      basePayload,
      cleanPayload({ ...basePayload, updated_at: undefined }, { keepEmpty: true }),
      cleanPayload({ ...basePayload, owner_id: undefined }, { keepEmpty: true }),
    ];

    const client = getClient();
    let lastError = null;

    for (const candidate of candidates) {
      const { data, error } = await client
        .from("partners_requests")
        .insert([candidate])
        .select("*");

      if (!error) {
        const row = Array.isArray(data) && data.length ? data[0] : null;
        return { exists: false, row };
      }
      lastError = error;
    }

    throw lastError || new Error("Failed to save partner request");
  }

  function parseLooseJson(value) {
    const text = safeText(value);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function pickOrderItemProductId(row = {}) {
    const specificColumns = ORDER_ITEM_PRODUCT_ID_COLUMNS.filter((column) => column !== "id");
    const specific = safeText(pickFirst(row, specificColumns, ""));
    if (specific) return specific;

    const fallbackId = safeText(row?.id);
    if (!fallbackId) return "";

    const hasItemContext =
      ORDER_ITEM_NAME_COLUMNS.some((column) => safeText(row?.[column])) ||
      ORDER_ITEM_QTY_COLUMNS.some((column) => safeText(row?.[column])) ||
      ORDER_ITEM_PRICE_COLUMNS.some((column) => safeText(row?.[column]));

    return hasItemContext ? fallbackId : "";
  }

  function collectOrderItemCandidates(row = {}) {
    if (!row || typeof row !== "object") return [];

    const candidates = [];
    const sourceValues = [
      row.items,
      row.order_items,
      row.orderItems,
      row.products,
      row.order_products,
      row.orderProducts,
      row.order_details,
      row.orderDetails,
      row.details,
    ];

    sourceValues.forEach((value) => {
      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (entry && typeof entry === "object") candidates.push(entry);
        });
        return;
      }

      if (value && typeof value === "object") {
        candidates.push(value);
        return;
      }

      if (typeof value === "string") {
        const parsed = parseLooseJson(value);
        if (!parsed) return;
        if (Array.isArray(parsed)) {
          parsed.forEach((entry) => {
            if (entry && typeof entry === "object") candidates.push(entry);
          });
          return;
        }
        if (parsed && typeof parsed === "object") {
          candidates.push(parsed);
        }
      }
    });

    return candidates;
  }

  function extractOrderRowProductIds(row = {}) {
    const ids = new Set();
    const directId = pickOrderItemProductId(row);
    if (directId) ids.add(directId);

    collectOrderItemCandidates(row).forEach((item) => {
      const nestedId = pickOrderItemProductId(item);
      if (nestedId) ids.add(nestedId);
    });

    return [...ids];
  }

  function normalizeOrderItem(item, fallbackRow = null) {
    const quantity = toNumber(pickFirst(item, ORDER_ITEM_QTY_COLUMNS, pickFirst(fallbackRow, ORDER_ITEM_QTY_COLUMNS, 1))) || 1;
    const price = toNumber(pickFirst(item, ORDER_ITEM_PRICE_COLUMNS, pickFirst(fallbackRow, ORDER_ITEM_PRICE_COLUMNS, 0)));
    return {
      productId: String(pickOrderItemProductId(item) || pickOrderItemProductId(fallbackRow || {})),
      name: safeText(pickFirst(item, ORDER_ITEM_NAME_COLUMNS, pickFirst(fallbackRow, ORDER_ITEM_NAME_COLUMNS, "منتج"))),
      quantity,
      price,
      lineTotal: quantity * price,
    };
  }

  function normalizeOrderStatus(value) {
    const status = safeText(value).toLowerCase();
    if (!status) return "pending";
    if (status.includes("pending") || status.includes("مراج")) return "pending";
    if (status.includes("preparing") || status.includes("تجه")) return "preparing";
    if (status.includes("shipped") || status.includes("شحن")) return "shipped";
    if (status.includes("delivered") || status.includes("تسليم")) return "delivered";
    return status;
  }

  function normalizeRpcOrders(data) {
    if (!Array.isArray(data)) return [];

    const grouped = new Map();

    data.forEach((row) => {
      const orderId = String(pickFirst(row, ["order_id", "id"], ""));
      if (!orderId) return;

      if (!grouped.has(orderId)) {
        grouped.set(orderId, {
          id: orderId,
          status: normalizeOrderStatus(pickFirst(row, ORDER_STATUS_COLUMNS, "pending")),
          createdAt: safeText(pickFirst(row, ["created_at", "order_created_at", "createdAt"], "")),
          customerName: safeText(pickFirst(row, ["customer_name", "user_name", "name"], "")),
          customerEmail: normalizeEmail(pickFirst(row, ["customer_email", "user_email", "email"], "")),
          customerPhone: safeText(pickFirst(row, ["customer_phone", "phone"], "")),
          address: safeText(pickFirst(row, ["address", "customer_address"], "")),
          total: toNumber(pickFirst(row, ["total", "total_price", "amount"], 0)),
          items: [],
        });
      }

      const target = grouped.get(orderId);
      const maybeItems = collectOrderItemCandidates(row);

      if (Array.isArray(maybeItems) && maybeItems.length) {
        maybeItems.forEach((item) => target.items.push(normalizeOrderItem(item, row)));
      } else if (pickOrderItemProductId(row) || row.product_name || row.quantity || row.price) {
        target.items.push(normalizeOrderItem(row, row));
      }
    });

    const out = [...grouped.values()].map((order) => {
      if (!order.total) {
        order.total = order.items.reduce((sum, item) => sum + item.lineTotal, 0);
      }
      return order;
    });

    out.sort((a, b) => {
      const dateA = Date.parse(a.createdAt || "") || 0;
      const dateB = Date.parse(b.createdAt || "") || 0;
      if (dateA !== dateB) return dateB - dateA;
      return toNumber(b.id) - toNumber(a.id);
    });

    return out;
  }

  async function callRpcWithFallback(candidates) {
    const client = getClient();
    let lastError = null;

    for (const candidate of candidates) {
      const { data, error } = await client.rpc(candidate.name, candidate.args || {});
      if (!error) return { data, fn: candidate.name };
      lastError = error;
      if (isFunctionNotFoundError(error)) continue;
      throw error;
    }

    throw lastError || new Error("RPC function not found.");
  }

  function buildOrderOwnerCandidates(owner = {}) {
    const idSet = new Set();
    const emailSet = new Set();

    const pushId = (value) => {
      const clean = safeText(value);
      if (!clean) return;
      idSet.add(clean);
    };
    const pushEmail = (value) => {
      const clean = normalizeEmail(value);
      if (!clean) return;
      emailSet.add(clean);
    };

    pushId(owner.id);
    pushEmail(owner.email);

    return {
      ids: [...idSet],
      emails: [...emailSet],
    };
  }

  function rowBelongsToOrderOwner(row, ownerCandidates = {}) {
    if (!row || typeof row !== "object") return false;

    const ids = Array.from(
      new Set(
        (Array.isArray(ownerCandidates.ids) ? ownerCandidates.ids : [])
          .map((value) => safeText(value))
          .filter(Boolean)
      )
    );
    const emails = Array.from(
      new Set(
        (Array.isArray(ownerCandidates.emails) ? ownerCandidates.emails : [])
          .map((value) => normalizeEmail(value))
          .filter(Boolean)
      )
    );

    if (ids.length) {
      const idColumns = Array.from(new Set([...ORDER_OWNER_ID_COLUMNS, ...PRODUCT_OWNER_ID_COLUMNS]));
      const rowIds = idColumns.map((column) => safeText(row[column])).filter(Boolean);
      if (rowIds.some((value) => ids.includes(value))) return true;
    }

    if (emails.length) {
      const emailColumns = Array.from(new Set([...ORDER_OWNER_EMAIL_COLUMNS, ...PRODUCT_OWNER_EMAIL_COLUMNS]));
      const rowEmails = emailColumns.map((column) => normalizeEmail(row[column])).filter(Boolean);
      if (rowEmails.some((value) => emails.includes(value))) return true;
    }

    return false;
  }

  function normalizeOrderBaseRecord(row = {}, fallbackId = "") {
    return {
      id: String(pickFirst(row, ORDER_ID_COLUMNS, fallbackId)),
      status: normalizeOrderStatus(pickFirst(row, ORDER_STATUS_COLUMNS, "pending")),
      createdAt: safeText(pickFirst(row, ["created_at", "order_created_at", "createdAt"], "")),
      customerName: safeText(pickFirst(row, ["customer_name", "user_name", "name"], "")),
      customerEmail: normalizeEmail(pickFirst(row, ["customer_email", "user_email", "email"], "")),
      customerPhone: safeText(pickFirst(row, ["customer_phone", "phone"], "")),
      address: safeText(pickFirst(row, ["address", "customer_address"], "")),
      total: toNumber(pickFirst(row, ["total", "total_price", "amount"], 0)),
      items: [],
    };
  }

  function dedupeOrderItems(items = []) {
    const out = [];
    const seen = new Set();

    (Array.isArray(items) ? items : []).forEach((item) => {
      const normalized = normalizeOrderItem(item || {}, null);
      const key = [
        safeText(normalized.productId),
        safeText(normalized.name).toLowerCase(),
        toNumber(normalized.quantity),
        toNumber(normalized.price),
      ].join("|");
      if (seen.has(key)) return;
      seen.add(key);
      out.push(normalized);
    });

    return out;
  }

  function sortNormalizedOrders(rows = []) {
    const out = Array.isArray(rows) ? rows.slice() : [];
    out.sort((a, b) => {
      const dateA = Date.parse(a.createdAt || "") || 0;
      const dateB = Date.parse(b.createdAt || "") || 0;
      if (dateA !== dateB) return dateB - dateA;
      return toNumber(b.id) - toNumber(a.id);
    });
    return out;
  }

  function hasAnyKnownOwnerColumn(row) {
    if (!row || typeof row !== "object") return false;
    const keys = Object.keys(row);
    const known = new Set([...ORDER_OWNER_ID_COLUMNS, ...ORDER_OWNER_EMAIL_COLUMNS, ...PRODUCT_OWNER_ID_COLUMNS, ...PRODUCT_OWNER_EMAIL_COLUMNS]);
    return keys.some((key) => known.has(String(key || "").toLowerCase()));
  }

  function chunkArray(values = [], size = 200) {
    const out = [];
    const list = Array.isArray(values) ? values : [];
    const chunkSize = Math.max(1, toNumber(size) || 1);
    for (let i = 0; i < list.length; i += chunkSize) {
      out.push(list.slice(i, i + chunkSize));
    }
    return out;
  }

  function normalizeOrderForMerge(order = {}) {
    const items = dedupeOrderItems(Array.isArray(order.items) ? order.items : []);
    const computedTotal = toNumber(order.total) || items.reduce((sum, item) => sum + toNumber(item.lineTotal), 0);
    return {
      id: safeText(order.id),
      status: normalizeOrderStatus(order.status),
      createdAt: safeText(order.createdAt),
      customerName: safeText(order.customerName),
      customerEmail: normalizeEmail(order.customerEmail),
      customerPhone: safeText(order.customerPhone),
      address: safeText(order.address),
      total: computedTotal,
      items,
    };
  }

  function mergeNormalizedOrderRecords(base = null, incoming = null) {
    if (!base && !incoming) return null;
    if (!base) return normalizeOrderForMerge(incoming || {});
    if (!incoming) return normalizeOrderForMerge(base || {});

    const left = normalizeOrderForMerge(base);
    const right = normalizeOrderForMerge(incoming);
    const mergedItems = dedupeOrderItems([...(left.items || []), ...(right.items || [])]);
    const mergedStatus =
      normalizeOrderStatus(right.status) !== "pending"
        ? normalizeOrderStatus(right.status)
        : normalizeOrderStatus(left.status || right.status);

    return {
      id: safeText(left.id || right.id),
      status: mergedStatus || "pending",
      createdAt: safeText(right.createdAt || left.createdAt),
      customerName: safeText(right.customerName || left.customerName),
      customerEmail: normalizeEmail(right.customerEmail || left.customerEmail),
      customerPhone: safeText(right.customerPhone || left.customerPhone),
      address: safeText(right.address || left.address),
      total: toNumber(right.total) || toNumber(left.total) || mergedItems.reduce((sum, item) => sum + toNumber(item.lineTotal), 0),
      items: mergedItems,
    };
  }

  function mergeNormalizedOrderLists(...lists) {
    const grouped = new Map();

    lists.forEach((rows) => {
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        const normalized = normalizeOrderForMerge(row || {});
        if (!normalized.id) return;
        const existing = grouped.get(normalized.id) || null;
        grouped.set(normalized.id, mergeNormalizedOrderRecords(existing, normalized));
      });
    });

    return sortNormalizedOrders(
      [...grouped.values()].map((row) => normalizeOrderForMerge(row))
    );
  }

  async function collectOwnedProductIds(ownerCandidates = {}, productIds = []) {
    const list = [...new Set((Array.isArray(productIds) ? productIds : []).map((value) => safeText(value)).filter(Boolean))];
    if (!list.length) return new Set();

    const client = getClient();
    let productTables = [];
    try {
      productTables = await resolveAvailableProductTables();
    } catch {
      productTables = [];
    }
    if (!productTables.length) return new Set();

    const owned = new Set();

    for (const table of productTables) {
      const rows = [];
      const seenRows = new Set();
      const chunks = chunkArray(list, 150);
      const idColumns = Array.from(new Set(PRODUCT_ID_COLUMNS));
      let hasQueryableIdColumn = false;

      for (const chunk of chunks) {
        for (const idColumn of idColumns) {
          const { data, error } = await client.from(table).select("*").in(idColumn, chunk);
          if (error) {
            if (isAuthPermissionError(error)) {
              hasQueryableIdColumn = false;
              break;
            }
            if (isMissingColumnError(error) || isTypeMismatchError(error)) {
              continue;
            }
            continue;
          }

          hasQueryableIdColumn = true;
          (Array.isArray(data) ? data : []).forEach((row) => {
            const rowKey = safeText(pickFirst(row, PRODUCT_ID_COLUMNS, ""));
            if (rowKey && seenRows.has(rowKey)) return;
            if (rowKey) seenRows.add(rowKey);
            rows.push(row);
          });
        }
      }

      if (!hasQueryableIdColumn || !rows.length) {
        const fallback = await client.from(table).select("*").limit(4000);
        if (fallback.error) {
          if (isAuthPermissionError(fallback.error)) continue;
          continue;
        }
        const fallbackRows = Array.isArray(fallback.data) ? fallback.data : [];
        fallbackRows
          .filter((row) => PRODUCT_ID_COLUMNS.some((column) => list.includes(safeText(row?.[column]))))
          .forEach((row) => rows.push(row));
      }

      rows.forEach((row) => {
        if (!rowBelongsToOrderOwner(row, ownerCandidates)) return;
        PRODUCT_ID_COLUMNS.forEach((column) => {
          const productId = safeText(row?.[column]);
          if (productId && list.includes(productId)) {
            owned.add(productId);
          }
        });
      });
    }

    return owned;
  }

  async function getPartnerOrdersFromLinkedItems(ownerCandidates = {}) {
    const client = getClient();
    const orderItemTables = await resolveAvailableOrderItemTables();
    if (!orderItemTables.length) return [];

    const rawRows = [];
    const productIds = new Set();

    for (const table of orderItemTables) {
      const { data, error } = await client.from(table).select("*").limit(4000);
      if (error) {
        if (isAuthPermissionError(error)) continue;
        continue;
      }

      const rows = Array.isArray(data) ? data : [];
      rows.forEach((row) => {
        const orderId = safeText(pickFirst(row, [...ORDER_ITEM_ORDER_ID_COLUMNS, ...ORDER_ID_COLUMNS], ""));
        if (!orderId) return;
        const productId = pickOrderItemProductId(row);
        if (productId) productIds.add(productId);
        rawRows.push({
          orderId,
          productId,
          row,
          ownerMatched: rowBelongsToOrderOwner(row, ownerCandidates),
        });
      });
    }

    if (!rawRows.length) return [];

    const ownedProductIds = await collectOwnedProductIds(ownerCandidates, [...productIds]);
    const grouped = new Map();

    rawRows.forEach((entry) => {
      if (!entry.ownerMatched && !ownedProductIds.has(entry.productId)) return;

      let target = grouped.get(entry.orderId);
      if (!target) {
        target = normalizeOrderBaseRecord(entry.row, entry.orderId);
        grouped.set(entry.orderId, target);
      }

      const item = normalizeOrderItem(
        {
          product_id: entry.productId || pickOrderItemProductId(entry.row),
          product_name: pickFirst(entry.row, ORDER_ITEM_NAME_COLUMNS, "منتج"),
          quantity: pickFirst(entry.row, ORDER_ITEM_QTY_COLUMNS, 1),
          price: pickFirst(entry.row, ORDER_ITEM_PRICE_COLUMNS, 0),
        },
        entry.row
      );

      target.items.push(item);
      if (!target.total) {
        target.total = toNumber(pickFirst(entry.row, ["total", "total_price", "amount"], 0));
      }
    });

    if (!grouped.size) return [];

    const ids = [...grouped.keys()];
    const idSet = new Set(ids);
    const orderTables = await resolveAvailableOrderTables();

    for (const table of orderTables) {
      const mergedRows = [];
      const seenRows = new Set();

      for (const idColumn of ORDER_ID_COLUMNS) {
        for (const chunk of chunkArray(ids, 150)) {
          const { data, error } = await client.from(table).select("*").in(idColumn, chunk);
          if (error) {
            if (isAuthPermissionError(error)) break;
            if (isMissingColumnError(error) || isTypeMismatchError(error)) continue;
            continue;
          }

          (Array.isArray(data) ? data : []).forEach((row) => {
            const rowId = safeText(pickFirst(row, ORDER_ID_COLUMNS, ""));
            if (!rowId || !idSet.has(rowId) || seenRows.has(rowId)) return;
            seenRows.add(rowId);
            mergedRows.push(row);
          });
        }
      }

      if (!mergedRows.length) continue;

      mergedRows.forEach((row) => {
        const rowId = safeText(pickFirst(row, ORDER_ID_COLUMNS, ""));
        if (!rowId || !grouped.has(rowId)) return;

        const current = grouped.get(rowId);
        const base = normalizeOrderBaseRecord(row, rowId);
        base.items = Array.isArray(current.items) ? current.items.slice() : [];
        grouped.set(rowId, mergeNormalizedOrderRecords(current, base));
      });
    }

    return sortNormalizedOrders(
      [...grouped.values()].map((order) => normalizeOrderForMerge(order))
    );
  }

  async function getPartnerOrdersFromTables(ownerCandidates = {}) {
    const client = getClient();
    const orderTables = await resolveAvailableOrderTables();

    const directRows = [];
    const allOrderRows = [];
    for (const table of orderTables) {
      const { data, error } = await client.from(table).select("*").limit(1000);
      if (error) {
        if (isAuthPermissionError(error)) continue;
        continue;
      }

      const rows = Array.isArray(data) ? data : [];
      rows.forEach((row) => allOrderRows.push(row));
      const filtered = rows.filter((row) => rowBelongsToOrderOwner(row, ownerCandidates));
      filtered.forEach((row) => directRows.push(row));
    }

    const normalized = normalizeRpcOrders(directRows);
    const grouped = new Map(
      normalized.map((order) => [
        String(order.id),
        {
          ...order,
          items: Array.isArray(order.items) ? order.items.slice() : [],
        },
      ])
    );

    const knownOrderIds = new Set(
      normalized
        .map((order) => safeText(order.id))
        .filter(Boolean)
    );

    const unresolvedOrderRows = allOrderRows.filter((row) => {
      const rowOrderId = safeText(pickFirst(row, ORDER_ID_COLUMNS, ""));
      return Boolean(rowOrderId && !knownOrderIds.has(rowOrderId));
    });

    const unresolvedOrderProductIds = [
      ...new Set(
        unresolvedOrderRows
          .flatMap((row) => extractOrderRowProductIds(row))
          .map((value) => safeText(value))
          .filter(Boolean)
      ),
    ];

    if (unresolvedOrderRows.length && unresolvedOrderProductIds.length) {
      const ownedOrderProductIds = await collectOwnedProductIds(ownerCandidates, unresolvedOrderProductIds);

      unresolvedOrderRows.forEach((row) => {
        const rowOrderId = safeText(pickFirst(row, ORDER_ID_COLUMNS, ""));
        if (!rowOrderId || knownOrderIds.has(rowOrderId)) return;

        const rowProductIds = extractOrderRowProductIds(row);
        if (!rowProductIds.length) return;
        if (!rowProductIds.some((productId) => ownedOrderProductIds.has(productId))) return;

        const normalizedRows = normalizeRpcOrders([row]);
        const rowOrder = Array.isArray(normalizedRows) && normalizedRows.length
          ? normalizedRows[0]
          : normalizeOrderBaseRecord(row, rowOrderId);

        const existing = grouped.get(rowOrderId) || null;
        grouped.set(rowOrderId, mergeNormalizedOrderRecords(existing, rowOrder));
        knownOrderIds.add(rowOrderId);
      });
    }

    const orderItemTables = await resolveAvailableOrderItemTables();
    for (const table of orderItemTables) {
      const { data, error } = await client.from(table).select("*").limit(2000);
      if (error) {
        if (isAuthPermissionError(error)) continue;
        continue;
      }

      const rows = Array.isArray(data) ? data : [];
      const itemProductIds = [
        ...new Set(
          rows
            .map((row) => pickOrderItemProductId(row))
            .filter(Boolean)
        ),
      ];
      const ownedItemProductIds = itemProductIds.length
        ? await collectOwnedProductIds(ownerCandidates, itemProductIds)
        : new Set();

      rows.forEach((row) => {
        const rowOrderId = safeText(pickFirst(row, [...ORDER_ITEM_ORDER_ID_COLUMNS, ...ORDER_ID_COLUMNS], ""));
        if (!rowOrderId) return;

        const ownerMatched = rowBelongsToOrderOwner(row, ownerCandidates);
        const rowProductIds = extractOrderRowProductIds(row);
        const rowProductId = rowProductIds[0] || "";
        const productOwned = rowProductIds.some((productId) => ownedItemProductIds.has(productId));
        if (!knownOrderIds.has(rowOrderId) && !ownerMatched && !productOwned) return;

        knownOrderIds.add(rowOrderId);

        let target = grouped.get(rowOrderId);
        if (!target) {
          target = normalizeOrderBaseRecord(row, rowOrderId);
          grouped.set(rowOrderId, target);
        } else {
          if (!safeText(target.createdAt)) {
            target.createdAt = safeText(pickFirst(row, ["created_at", "order_created_at", "createdAt"], ""));
          }
          if (!safeText(target.customerName)) {
            target.customerName = safeText(pickFirst(row, ["customer_name", "user_name", "name"], ""));
          }
          if (!safeText(target.customerEmail)) {
            target.customerEmail = normalizeEmail(pickFirst(row, ["customer_email", "user_email", "email"], ""));
          }
          if (!safeText(target.customerPhone)) {
            target.customerPhone = safeText(pickFirst(row, ["customer_phone", "phone"], ""));
          }
          if (!safeText(target.address)) {
            target.address = safeText(pickFirst(row, ["address", "customer_address"], ""));
          }
          if (!target.total) {
            target.total = toNumber(pickFirst(row, ["total", "total_price", "amount"], 0));
          }
        }

        const item = normalizeOrderItem({
          product_id: rowProductId || pickOrderItemProductId(row),
          product_name: pickFirst(row, ORDER_ITEM_NAME_COLUMNS, "منتج"),
          quantity: pickFirst(row, ORDER_ITEM_QTY_COLUMNS, 1),
          price: pickFirst(row, ORDER_ITEM_PRICE_COLUMNS, 0),
        }, row);

        target.items.push(item);
      });
    }

    const out = [...grouped.values()].map((order) => {
      const items = dedupeOrderItems(order.items);
      const total = order.total || items.reduce((sum, item) => sum + item.lineTotal, 0);
      return {
        ...order,
        status: normalizeOrderStatus(order.status),
        items,
        total,
      };
    });

    const linkedOrders = await getPartnerOrdersFromLinkedItems(ownerCandidates);
    return mergeNormalizedOrderLists(out, linkedOrders);
  }

  async function updateOrderStatusDirect(orderId, status, ownerCandidates = {}) {
    const cleanOrderId = safeText(orderId);
    const cleanStatus = normalizeOrderStatus(status);
    if (!cleanOrderId || !cleanStatus) return false;

    const client = getClient();
    const orderTables = await resolveAvailableOrderTables();
    if (!orderTables.length) return false;

    const now = new Date().toISOString();
    const payloads = [
      cleanPayload({ status: cleanStatus, updated_at: now }, { keepEmpty: true }),
      cleanPayload({ order_status: cleanStatus, updated_at: now }, { keepEmpty: true }),
      cleanPayload({ status: cleanStatus, order_status: cleanStatus, updated_at: now }, { keepEmpty: true }),
      cleanPayload({ status: cleanStatus }, { keepEmpty: true }),
      cleanPayload({ order_status: cleanStatus }, { keepEmpty: true }),
    ].filter((payload) => Object.keys(payload).length);

    const rawCandidates = [];

    (Array.isArray(ownerCandidates.ids) ? ownerCandidates.ids : []).forEach((ownerValue) => {
      const cleanOwner = safeText(ownerValue);
      if (!cleanOwner) return;
      ORDER_OWNER_ID_COLUMNS.forEach((ownerColumn) => {
        ORDER_ID_COLUMNS.forEach((idColumn) => {
          rawCandidates.push({ idColumn, ownerColumn, ownerValue: cleanOwner });
        });
      });
    });

    (Array.isArray(ownerCandidates.emails) ? ownerCandidates.emails : []).forEach((ownerValue) => {
      const cleanOwner = normalizeEmail(ownerValue);
      if (!cleanOwner) return;
      ORDER_OWNER_EMAIL_COLUMNS.forEach((ownerColumn) => {
        ORDER_ID_COLUMNS.forEach((idColumn) => {
          rawCandidates.push({ idColumn, ownerColumn, ownerValue: cleanOwner });
        });
      });
    });

    ORDER_ID_COLUMNS.forEach((idColumn) => {
      rawCandidates.push({ idColumn, ownerColumn: "", ownerValue: "" });
    });

    const seen = new Set();
    const matchCandidates = rawCandidates.filter((candidate) => {
      const key = `${candidate.idColumn}|${candidate.ownerColumn}|${candidate.ownerValue}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    for (const table of orderTables) {
      for (const payload of payloads) {
        for (const candidate of matchCandidates) {
          let query = client
            .from(table)
            .update(payload)
            .eq(candidate.idColumn, cleanOrderId);

          if (candidate.ownerColumn && candidate.ownerValue) {
            query = query.eq(candidate.ownerColumn, candidate.ownerValue);
          }

          const { data, error } = await query.select("*").limit(1);
          if (error) {
            if (isAuthPermissionError(error)) throw error;
            if (isMissingColumnError(error) || isTypeMismatchError(error)) continue;
            continue;
          }

          if (Array.isArray(data) && data.length) return true;
        }
      }
    }

    return false;
  }

  function dedupeRpcCandidates(candidates = []) {
    const out = [];
    const seen = new Set();
    (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
      const name = safeText(candidate?.name || "");
      if (!name) return;
      const args = candidate?.args && typeof candidate.args === "object" ? candidate.args : {};
      const key = `${name}|${JSON.stringify(args)}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ name, args });
    });
    return out;
  }

  function isRecoverableRpcError(error) {
    if (!error) return false;
    if (isFunctionNotFoundError(error)) return true;
    if (isTypeMismatchError(error)) return true;

    const status = Number(error.status || 0);
    const text = getErrorText(error).toLowerCase();
    if (status === 400) return true;
    if (text.includes("function") && text.includes("does not exist")) return true;
    if (text.includes("could not find the function")) return true;
    if (text.includes("invalid input syntax for type")) return true;
    return false;
  }

  async function callOrderRpcCandidates(candidates = []) {
    const client = getClient();
    const list = dedupeRpcCandidates(candidates);

    let lastError = null;
    let hadSuccess = false;

    for (const candidate of list) {
      const { data, error } = await client.rpc(candidate.name, candidate.args || {});
      if (error) {
        lastError = error;
        if (isRecoverableRpcError(error)) continue;
        if (isAuthPermissionError(error)) throw error;
        continue;
      }

      hadSuccess = true;
      const normalized = normalizeRpcOrders(data);
      if (normalized.length) return normalized;
    }

    if (hadSuccess) return [];
    if (lastError) throw lastError;
    return [];
  }

  function parseUpdateRpcResult(data) {
    if (typeof data === "boolean") return data;
    if (Array.isArray(data)) return data.length > 0;
    if (data && typeof data === "object" && "updated" in data) return Boolean(data.updated);
    if (data && typeof data === "object" && "success" in data) return Boolean(data.success);
    return true;
  }

  async function callUpdateOrderRpcCandidates(candidates = []) {
    const client = getClient();
    const list = dedupeRpcCandidates(candidates);

    let lastError = null;
    let hadSuccess = false;

    for (const candidate of list) {
      const { data, error } = await client.rpc(candidate.name, candidate.args || {});
      if (error) {
        lastError = error;
        if (isRecoverableRpcError(error)) continue;
        if (isAuthPermissionError(error)) throw error;
        continue;
      }

      hadSuccess = true;
      if (parseUpdateRpcResult(data)) return true;
    }

    if (hadSuccess) return false;
    if (lastError) throw lastError;
    return false;
  }

  async function getPartnerOrders(ownerInput = null) {
    const owner = await resolveOwnerContext(ownerInput);
    if (isLocalOwner(owner)) {
      const localOrders = readStorageJSON(LOCAL_KEYS.orders, []);
      return Array.isArray(localOrders) ? localOrders : [];
    }

    const resolvedOwner = await resolveProductOwnerForInsert(owner);
    const ownerCandidates = buildOrderOwnerCandidates({
      id: safeText(resolvedOwner.id || owner.id),
      email: normalizeEmail(resolvedOwner.email || owner.email),
    });

    const functionNames = ["get_partner_orders", "get_seller_orders"];
    const idArgNames = ["p_seller_id", "seller_id", "p_owner_id", "owner_id", "user_id"];
    const emailArgNames = ["p_seller_email", "seller_email", "p_owner_email", "owner_email", "user_email", "email"];
    const rpcCandidates = [];

    functionNames.forEach((fn) => {
      ownerCandidates.ids.forEach((idValue) => {
        idArgNames.forEach((argName) => {
          rpcCandidates.push({ name: fn, args: { [argName]: idValue } });
        });
      });

      ownerCandidates.emails.forEach((emailValue) => {
        emailArgNames.forEach((argName) => {
          rpcCandidates.push({ name: fn, args: { [argName]: emailValue } });
        });
      });

      ownerCandidates.ids.forEach((idValue) => {
        ownerCandidates.emails.forEach((emailValue) => {
          rpcCandidates.push({
            name: fn,
            args: {
              p_seller_id: idValue,
              p_seller_email: emailValue,
            },
          });
        });
      });
    });

    if (!rpcCandidates.length) {
      throw new Error("Partner identity is required to read orders.");
    }

    let rpcOrders = [];
    let rpcError = null;
    try {
      rpcOrders = await callOrderRpcCandidates(rpcCandidates);
    } catch (error) {
      if (isAuthPermissionError(error)) throw error;
      rpcError = error;
    }

    if (Array.isArray(rpcOrders) && rpcOrders.length) {
      return rpcOrders;
    }

    try {
      const tableOrders = await getPartnerOrdersFromTables(ownerCandidates);
      if (Array.isArray(tableOrders) && tableOrders.length) return tableOrders;
      if (Array.isArray(rpcOrders) && rpcOrders.length === 0) return tableOrders;
    } catch (tableError) {
      if (isAuthPermissionError(tableError)) throw tableError;
      if (!rpcError) rpcError = tableError;
    }

    if (rpcError) {
      console.warn("orders rpc fallback returned no rows", {
        status: Number(rpcError?.status || 0) || undefined,
        code: safeText(rpcError?.code || ""),
        message: safeText(rpcError?.message || ""),
      });
    }
    return [];
  }

  async function updateOrderStatus(orderId, status, ownerInput = null) {
    const owner = await resolveOwnerContext(ownerInput);
    if (isLocalOwner(owner)) {
      const cleanOrderId = safeText(orderId);
      const cleanStatus = normalizeOrderStatus(status);
      const rows = readStorageJSON(LOCAL_KEYS.orders, []);
      const list = Array.isArray(rows) ? rows : [];
      const idx = list.findIndex((item) => String(item.id) === cleanOrderId);
      if (idx < 0) return false;
      list[idx] = { ...list[idx], status: cleanStatus };
      writeStorageJSON(LOCAL_KEYS.orders, list);
      return true;
    }

    const cleanOrderId = safeText(orderId);
    const cleanStatus = normalizeOrderStatus(status);
    if (!cleanOrderId || !cleanStatus) {
      throw new Error("orderId and status are required.");
    }

    const resolvedOwner = await resolveProductOwnerForInsert(owner);
    const ownerCandidates = buildOrderOwnerCandidates({
      id: safeText(resolvedOwner.id || owner.id),
      email: normalizeEmail(resolvedOwner.email || owner.email),
    });

    const functionNames = ["update_partner_order_status", "set_partner_order_status"];
    const rpcCandidates = [];

    functionNames.forEach((fn) => {
      ownerCandidates.ids.forEach((idValue) => {
        rpcCandidates.push({
          name: fn,
          args: {
            p_seller_id: idValue,
            p_order_id: cleanOrderId,
            p_status: cleanStatus,
          },
        });
        rpcCandidates.push({
          name: fn,
          args: {
            seller_id: idValue,
            order_id: cleanOrderId,
            status: cleanStatus,
          },
        });
        rpcCandidates.push({
          name: fn,
          args: {
            owner_id: idValue,
            order_id: cleanOrderId,
            status: cleanStatus,
          },
        });
      });

      ownerCandidates.emails.forEach((emailValue) => {
        rpcCandidates.push({
          name: fn,
          args: {
            p_seller_email: emailValue,
            p_order_id: cleanOrderId,
            p_status: cleanStatus,
          },
        });
        rpcCandidates.push({
          name: fn,
          args: {
            seller_email: emailValue,
            order_id: cleanOrderId,
            status: cleanStatus,
          },
        });
        rpcCandidates.push({
          name: fn,
          args: {
            owner_email: emailValue,
            order_id: cleanOrderId,
            status: cleanStatus,
          },
        });
      });
    });

    if (!rpcCandidates.length) {
      throw new Error("Partner identity is required to update order status.");
    }

    let rpcUpdated = false;
    let rpcError = null;
    try {
      rpcUpdated = await callUpdateOrderRpcCandidates(rpcCandidates);
      if (rpcUpdated) return true;
    } catch (error) {
      if (isAuthPermissionError(error)) throw error;
      rpcError = error;
    }

    const updatedDirect = await updateOrderStatusDirect(cleanOrderId, cleanStatus, ownerCandidates);
    if (updatedDirect) return true;

    if (rpcError) {
      console.warn("order status rpc fallback failed", {
        status: Number(rpcError?.status || 0) || undefined,
        code: safeText(rpcError?.code || ""),
        message: safeText(rpcError?.message || ""),
      });
    }
    return false;
  }

  window.PartnerAPI = Object.freeze({
    raw: getClient,
    resolveProductTable,
    resolveOwnerContext,
    authSignUp,
    authSignIn,
    authSignOut,
    findLegacyUserForLogin,
    getAuthSession,
    getAuthUser,
    onAuthStateChange,
    getMyProfile,
    upsertProfile,
    syncUserRecord: syncUserDirectoryRecord,
    updateMyProfile,
    hasPartnerProfile,
    savePartnerRequest,
    getProductsForCurrentUser,
    getProductsForOwner,
    insertProduct,
    updateProduct,
    deleteProduct,
    getPartnerOrders,
    updateOrderStatus,
  });
})();
