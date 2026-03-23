(() => {
  "use strict";

  const PRODUCT_TABLE_CANDIDATES = ["products", "my_products"];
  const PRODUCT_ID_COLUMNS = ["id", "product_id"];
  const PRODUCT_OWNER_ID_COLUMNS = ["owner_id", "user_id", "seller_id"];
  const PRODUCT_OWNER_EMAIL_COLUMNS = ["owner_email", "seller_email", "email", "user_email"];
  const ORDER_STATUS_COLUMNS = ["status", "order_status"];
  const LEGACY_USER_TABLE_CANDIDATES = ["users"];
  const LEGACY_USER_EMAIL_COLUMNS = ["email"];
  const LEGACY_USER_EMAIL_SCAN_COLUMNS = ["email", "user_email", "owner_email", "mail"];
  const LEGACY_USER_PASSWORD_COLUMNS = ["password_hash", "password", "pass", "user_password", "passwordHash", "hashed_password"];
  const LEGACY_USER_NAME_COLUMNS = ["full_name", "name", "username", "owner_name"];
  const LEGACY_USER_PHONE_COLUMNS = ["phone", "mobile", "owner_phone", "phone_number"];
  const LOCAL_KEYS = Object.freeze({
    currentUser: "currentUser",
    profile: "local_profile_v1",
    partner: "local_partner_profile_v1",
    products: "local_products_v1",
    orders: "local_orders_v1",
  });

  const state = {
    client: null,
    availableProductTables: [],
    preferredInsertTable: "",
  };

  function normalizeEmail(value) {
    return window.BODASecurity?.normalizeEmail
      ? window.BODASecurity.normalizeEmail(value)
      : String(value || "").trim().toLowerCase();
  }

  function safeText(value) {
    return String(value || "").trim();
  }

  function sanitizeImageSource(value) {
    const text = safeText(value);
    if (!text) return "";

    if (window.BODASecurity?.sanitizeUrl) {
      return window.BODASecurity.sanitizeUrl(text, { allowDataImages: true });
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

    const next = {
      ...current,
      name: safeText(profile.full_name || profile.name || current.name),
      phone: safeText(profile.phone || current.phone),
    };

    writeStorageJSON(LOCAL_KEYS.currentUser, next);
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

    if (window.BODASecurity?.verifyPassword) {
      return window.BODASecurity.verifyPassword(plain, stored, email);
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
      pickFirst(record, ["image", "img1", "image1", "image_url", "img", "thumbnail"], ""),
      record.img2,
      record.img3,
      record.img4,
      record.img5,
      record.image2,
      record.image3,
      record.image4,
      record.image5,
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
      if (!error) available.push(table);
    }

    if (!available.length) {
      throw new Error("Neither products nor my_products is available in Supabase.");
    }

    state.availableProductTables = available;
    state.preferredInsertTable = available.includes("products") ? "products" : available[0];
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

    if (!session && normalizedEmail && plainPassword) {
      const signIn = await client.auth.signInWithPassword({ email: normalizedEmail, password: plainPassword });
      if (!signIn.error) {
        session = signIn.data?.session || session;
        user = signIn.data?.user || user;
      }
    }

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

    if (error) throw error;
    return {
      user: data?.user || null,
      session: data?.session || null,
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
      return {
        id: "",
        email: normalizeEmail(ownerInput),
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

  async function getMyProfile() {
    const owner = await resolveOwnerContext();
    if (isLocalOwner(owner)) {
      const local = readStorageJSON(LOCAL_KEYS.profile, null);
      if (local && normalizeEmail(local.email || "") === normalizeEmail(owner.email)) return local;
      return cleanPayload({
        id: owner.id,
        email: owner.email,
        full_name: owner.name,
        phone: owner.phone,
      }, { keepEmpty: true });
    }
    if (!owner.id) return null;
    return getProfileByUserId(owner.id);
  }

  async function upsertProfile(payload = {}, ownerInput = null) {
    const owner = await resolveOwnerContext(ownerInput);
    if (isLocalOwner(owner)) {
      const fullName = safeText(payload.full_name || payload.name || owner.name || "");
      const phone = safeText(payload.phone || owner.phone || "");
      const email = normalizeEmail(payload.email || owner.email || "");
      const localProfile = cleanPayload({
        id: owner.id || "local-admen788",
        email,
        full_name: fullName,
        phone,
        updated_at: new Date().toISOString(),
      }, { keepEmpty: true });
      writeStorageJSON(LOCAL_KEYS.profile, localProfile);
      syncLocalSessionUser(localProfile);
      return localProfile;
    }
    if (!owner.id) throw new Error("Authenticated user is required to upsert profile.");

    const fullName = safeText(payload.full_name || payload.name || owner.name || "");
    const phone = safeText(payload.phone || owner.phone || "");
    const email = normalizeEmail(payload.email || owner.email || "");

    const base = cleanPayload({
      id: owner.id,
      email,
      full_name: fullName,
      phone,
      updated_at: new Date().toISOString(),
    }, { keepEmpty: true });

    const candidates = [
      base,
      cleanPayload({ ...base, updated_at: undefined }, { keepEmpty: true }),
      cleanPayload({ id: owner.id, email, full_name: fullName, updated_at: new Date().toISOString() }, { keepEmpty: true }),
      cleanPayload({ id: owner.id, email, full_name: fullName }, { keepEmpty: true }),
    ];

    const client = getClient();
    let lastError = null;

    for (const candidate of candidates) {
      const { data, error } = await client
        .from("profiles")
        .upsert(candidate, { onConflict: "id" })
        .select("*")
        .maybeSingle();

      if (!error) {
        return data || candidate;
      }
      lastError = error;
    }

    throw lastError || new Error("Failed to upsert profile");
  }

  async function updateMyProfile(payload = {}) {
    const owner = await resolveOwnerContext();
    if (isLocalOwner(owner)) {
      return upsertProfile({
        full_name: payload.full_name || payload.name || owner.name,
        phone: payload.phone || owner.phone,
        email: owner.email,
      }, owner);
    }
    if (!owner.id) throw new Error("Authenticated user is required.");

    const updatePayload = cleanPayload({
      full_name: payload.full_name || payload.name,
      phone: payload.phone,
      updated_at: new Date().toISOString(),
    }, { keepEmpty: true });

    if (!Object.keys(updatePayload).length) {
      return getProfileByUserId(owner.id);
    }

    const client = getClient();
    const candidates = [
      updatePayload,
      cleanPayload({ ...updatePayload, updated_at: undefined }, { keepEmpty: true }),
    ];

    let lastError = null;
    for (const candidate of candidates) {
      const { data, error } = await client
        .from("profiles")
        .update(candidate)
        .eq("id", owner.id)
        .select("*")
        .maybeSingle();

      if (!error) {
        if (data) return data;
        break;
      }
      lastError = error;
      if (isMissingTableError(error)) {
        return upsertProfile(payload, owner);
      }
    }

    if (lastError) throw lastError;
    return upsertProfile(payload, owner);
  }

  function normalizeProduct(row, sourceTable) {
    const images = collectImages(row);
    const price = toNumber(pickFirst(row, ["price", "current_price", "amount"], 0));
    const discountPercent = toNumber(pickFirst(row, ["discount_percent", "discount"], 0));
    const quantity = toNumber(pickFirst(row, ["quantity", "stock"], 0));

    return {
      id: String(pickFirst(row, ["id", "product_id"], "")),
      sourceTable,
      ownerId: String(pickFirst(row, ["owner_id", "user_id", "seller_id"], "")),
      name: safeText(pickFirst(row, ["product_name", "name", "title"], "")),
      price,
      discountPercent,
      finalPrice: discountPercent > 0 ? price - (price * discountPercent) / 100 : price,
      description: safeText(pickFirst(row, ["description", "desc"], "")),
      quantity,
      category: safeText(pickFirst(row, ["category", "store_category"], "")),
      email: normalizeEmail(pickFirst(row, ["owner_email", "seller_email", "email", "user_email"], "")),
      phone: safeText(pickFirst(row, ["phone", "owner_phone"], "")),
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

  function buildProductInsertPayloads(table, product, owner) {
    const images = mapInputImages(product.images);
    const firstImage = images[0] || "";
    const discountPercent = toNumber(product.discountPercent);
    const price = toNumber(product.price);
    const quantity = toNumber(product.quantity);
    const finalPrice = discountPercent > 0 ? price - (price * discountPercent) / 100 : price;

    if (table === "my_products") {
      return [
        cleanPayload({
          owner_id: owner.id,
          owner_email: owner.email,
          email: owner.email,
          product_name: product.name,
          name: product.name,
          price,
          discount_percent: discountPercent,
          description: product.description,
          quantity,
          category: product.category,
          img1: images[0] || "",
          img2: images[1] || "",
          img3: images[2] || "",
          img4: images[3] || "",
          img5: images[4] || "",
          phone: safeText(product.phone || owner.phone || ""),
          updated_at: new Date().toISOString(),
        }, { keepEmpty: true }),
        cleanPayload({
          owner_id: owner.id,
          owner_email: owner.email,
          email: owner.email,
          name: product.name,
          price,
          description: product.description,
          quantity,
          category: product.category,
          image: firstImage,
          phone: safeText(product.phone || owner.phone || ""),
          updated_at: new Date().toISOString(),
        }, { keepEmpty: true }),
      ];
    }

    return [
      cleanPayload({
        owner_id: owner.id,
        owner_email: owner.email,
        seller_email: owner.email,
        name: product.name,
        product_name: product.name,
        price,
        price_after_discount: finalPrice,
        discount_percent: discountPercent,
        stock: quantity,
        quantity,
        description: product.description,
        image: firstImage,
        extra_links: images.slice(1).join(", "),
        category: product.category,
        phone: safeText(product.phone || owner.phone || ""),
        updated_at: new Date().toISOString(),
      }, { keepEmpty: true }),
      cleanPayload({
        owner_id: owner.id,
        owner_email: owner.email,
        seller_email: owner.email,
        product_name: product.name,
        price,
        discount_percent: discountPercent,
        description: product.description,
        quantity,
        category: product.category,
        img1: images[0] || "",
        img2: images[1] || "",
        img3: images[2] || "",
        img4: images[3] || "",
        img5: images[4] || "",
        phone: safeText(product.phone || owner.phone || ""),
        updated_at: new Date().toISOString(),
      }, { keepEmpty: true }),
    ];
  }

  async function tryInsertProductToCloud(client, table, product, owner) {
    const payloads = buildProductInsertPayloads(table, product, owner);
    let lastError = null;

    for (const payload of payloads) {
      const candidates = [
        payload,
        cleanPayload({ ...payload, owner_id: undefined }, { keepEmpty: true }),
      ];

      for (const candidate of candidates) {
        const { error } = await client.from(table).insert([candidate]);
        if (!error) return { ok: true };
        lastError = error;
      }
    }

    return { ok: false, error: lastError };
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
    const cloudOwner = {
      ...owner,
      id: undefined,
      authSource: "local-cloud-sync",
    };

    for (const table of order) {
      const result = await tryInsertProductToCloud(client, table, product, cloudOwner);
      if (result.ok) {
        state.preferredInsertTable = table;
        return true;
      }
    }

    return false;
  }

  async function insertProduct(product, ownerInput = null) {
    const owner = await resolveOwnerContext(ownerInput);
    if (isLocalOwner(owner)) {
      const rows = readLocalProducts();
      const record = normalizeLocalProduct(product, owner);
      rows.push(record);
      writeLocalProducts(sortProducts(rows));

      try {
        await trySyncLocalProductToCloud(product, owner);
      } catch (error) {
        console.warn("local product cloud sync skipped", error);
      }
      return true;
    }
    if (!owner.id || !owner.email) throw new Error("Authenticated owner is required.");

    const tables = await resolveAvailableProductTables();
    const preferred = state.preferredInsertTable && tables.includes(state.preferredInsertTable)
      ? state.preferredInsertTable
      : tables[0];
    const order = [preferred, ...tables.filter((table) => table !== preferred)];

    const client = getClient();
    let lastError = null;

    for (const table of order) {
      const payloads = buildProductInsertPayloads(table, product, owner);
      for (const payload of payloads) {
        const { error } = await client.from(table).insert([payload]);
        if (!error) {
          state.preferredInsertTable = table;
          return true;
        }
        lastError = error;
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

  async function updateProduct(productId, product, ownerInput = null) {
    const owner = await resolveOwnerContext(ownerInput);
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
    let lastError = null;

    for (const table of tables) {
      const result = await tryMutateProduct({
        action: "delete",
        table,
        productId,
        payload: {},
        owner,
      });

      if (result.done) return true;
      lastError = result.error || lastError;
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
    const client = getClient();
    const out = [];

    for (const table of tables) {
      let data = null;
      let error = null;

      const queries = [];
      if (owner.id) {
        queries.push(() => client.from(table).select("*").eq("owner_id", owner.id));
      }
      if (owner.email) {
        queries.push(() => client.from(table).select("*").eq("owner_email", owner.email));
        queries.push(() => client.from(table).select("*").eq("email", owner.email));
      }

      for (const run of queries) {
        const result = await run();
        if (!result.error) {
          data = result.data;
          error = null;
          break;
        }
        error = result.error;
        if (!isMissingColumnError(error)) break;
      }

      // Fall back to selecting all and filtering client-side when columns are missing.
      if (error && isMissingColumnError(error)) {
        const result = await client.from(table).select("*");
        if (!result.error) {
          data = result.data;
          error = null;
        }
      }

      if (error) continue;

      const rows = Array.isArray(data) ? data : [];
      rows
        .filter((row) => rowBelongsToOwner(row, owner))
        .forEach((row) => out.push(normalizeProduct(row, table)));
    }

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
    if (localRow && owner.email) {
      const rowEmail = normalizeEmail(localRow.owner_email || localRow.email || "");
      if (rowEmail && rowEmail === normalizeEmail(owner.email)) {
        return { exists: true, row: localRow };
      }
    }

    if (isLocalOwner(owner)) return { exists: false, row: null };

    const client = getClient();
    const attempts = [];

    if (owner.id) {
      attempts.push(() =>
        client
          .from("partners_requests")
          .select("*")
          .eq("owner_id", owner.id)
          .order("id", { ascending: false })
          .limit(1)
      );
    }

    if (owner.email) {
      attempts.push(() =>
        client
          .from("partners_requests")
          .select("*")
          .eq("owner_email", owner.email)
          .order("id", { ascending: false })
          .limit(1)
      );
      attempts.push(() =>
        client
          .from("partners_requests")
          .select("*")
          .eq("email", owner.email)
          .order("id", { ascending: false })
          .limit(1)
      );
    }

    let lastError = null;
    for (const run of attempts) {
      const { data, error } = await run();
      if (!error) {
        const row = Array.isArray(data) && data.length ? data[0] : null;
        return { exists: Boolean(row), row };
      }
      lastError = error;
      if (isMissingColumnError(error)) continue;
    }

    if (lastError) throw lastError;
    return { exists: false, row: null };
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
        .select("*")
        .limit(1);

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
        .select("*")
        .limit(1);

      if (!error) {
        const row = Array.isArray(data) && data.length ? data[0] : null;
        return { exists: false, row };
      }
      lastError = error;
    }

    throw lastError || new Error("Failed to save partner request");
  }

  function normalizeOrderItem(item, fallbackRow = null) {
    const quantity = toNumber(pickFirst(item, ["quantity", "qty"], pickFirst(fallbackRow, ["quantity", "qty"], 1))) || 1;
    const price = toNumber(pickFirst(item, ["price", "amount"], pickFirst(fallbackRow, ["price", "amount"], 0)));
    return {
      productId: String(pickFirst(item, ["product_id", "id"], pickFirst(fallbackRow, ["product_id"], ""))),
      name: safeText(pickFirst(item, ["product_name", "name"], pickFirst(fallbackRow, ["product_name", "name"], "منتج"))),
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
      const maybeItems = row.items;

      if (Array.isArray(maybeItems) && maybeItems.length) {
        maybeItems.forEach((item) => target.items.push(normalizeOrderItem(item, row)));
      } else if (row.product_id || row.product_name || row.quantity || row.price) {
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

  async function getPartnerOrders(ownerInput = null) {
    const owner = await resolveOwnerContext(ownerInput);
    if (isLocalOwner(owner)) {
      const localOrders = readStorageJSON(LOCAL_KEYS.orders, []);
      return Array.isArray(localOrders) ? localOrders : [];
    }
    if (!owner.id) throw new Error("Authenticated owner_id is required to read orders.");

    const { data } = await callRpcWithFallback([
      { name: "get_partner_orders", args: { p_seller_id: owner.id } },
      { name: "get_partner_orders", args: { seller_id: owner.id } },
      { name: "get_seller_orders", args: { p_seller_id: owner.id } },
    ]);

    return normalizeRpcOrders(data);
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
    if (!owner.id) throw new Error("Authenticated owner_id is required to update order status.");

    const cleanOrderId = safeText(orderId);
    const cleanStatus = normalizeOrderStatus(status);
    if (!cleanOrderId || !cleanStatus) {
      throw new Error("orderId and status are required.");
    }

    const { data } = await callRpcWithFallback([
      {
        name: "update_partner_order_status",
        args: {
          p_seller_id: owner.id,
          p_order_id: cleanOrderId,
          p_status: cleanStatus,
        },
      },
      {
        name: "update_partner_order_status",
        args: {
          seller_id: owner.id,
          order_id: cleanOrderId,
          status: cleanStatus,
        },
      },
      {
        name: "set_partner_order_status",
        args: {
          p_seller_id: owner.id,
          p_order_id: cleanOrderId,
          p_status: cleanStatus,
        },
      },
    ]);

    if (typeof data === "boolean") return data;
    if (Array.isArray(data)) return data.length > 0;
    if (data && typeof data === "object" && "updated" in data) return Boolean(data.updated);
    return true;
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
