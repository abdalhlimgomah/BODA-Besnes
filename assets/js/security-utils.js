(() => {
  "use strict";

  const HASH_PREFIX = "boda_v1";
  const HASH_SEPARATOR = "$";
  const CLIENT_PEPPER = "Buda_CLIENT_PEPPER_2026";

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function textToBytes(text) {
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(text);
    }

    const bytes = [];
    for (let i = 0; i < text.length; i += 1) {
      bytes.push(text.charCodeAt(i) & 255);
    }
    return new Uint8Array(bytes);
  }

  function bytesToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  async function sha256Hex(text) {
    const input = textToBytes(String(text || ""));

    if (window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === "function") {
      const digest = await window.crypto.subtle.digest("SHA-256", input);
      return bytesToHex(digest);
    }

    let hash = 0;
    const raw = String(text || "");
    for (let i = 0; i < raw.length; i += 1) {
      hash = (hash << 5) - hash + raw.charCodeAt(i);
      hash |= 0;
    }
    return `fallback_${Math.abs(hash)}`;
  }

  function randomSalt(length = 18) {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const bytes = new Uint8Array(length);

    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < length; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }

    let output = "";
    for (let i = 0; i < bytes.length; i += 1) {
      output += chars.charAt(bytes[i] % chars.length);
    }
    return output;
  }

  function constantTimeEqual(a, b) {
    const left = String(a || "");
    const right = String(b || "");
    if (left.length !== right.length) return false;

    let diff = 0;
    for (let i = 0; i < left.length; i += 1) {
      diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
    }
    return diff === 0;
  }

  function isHashedPassword(value) {
    return String(value || "").startsWith(`${HASH_PREFIX}${HASH_SEPARATOR}`);
  }

  async function hashPassword(password, email = "") {
    const plain = String(password || "");
    const userEmail = normalizeEmail(email);
    const salt = randomSalt(18);
    const digest = await sha256Hex(`${plain}|${userEmail}|${salt}|${CLIENT_PEPPER}`);
    return `${HASH_PREFIX}${HASH_SEPARATOR}${salt}${HASH_SEPARATOR}${digest}`;
  }

  async function verifyPassword(password, storedValue, email = "") {
    const plain = String(password || "");
    const stored = String(storedValue || "");
    const userEmail = normalizeEmail(email);

    if (!stored) return false;
    if (!isHashedPassword(stored)) return constantTimeEqual(plain, stored);

    const parts = stored.split(HASH_SEPARATOR);
    if (parts.length !== 3) return false;

    const salt = parts[1];
    const storedDigest = parts[2];
    if (!salt || !storedDigest) return false;

    const computed = await sha256Hex(`${plain}|${userEmail}|${salt}|${CLIENT_PEPPER}`);
    return constantTimeEqual(storedDigest, computed);
  }

  function isStrongPassword(password) {
    const value = String(password || "");
    if (value.length < 8) return false;

    const hasLower = /[a-z]/.test(value);
    const hasUpper = /[A-Z]/.test(value);
    const hasDigit = /\d/.test(value);
    const hasSpecial = /[^A-Za-z0-9]/.test(value);
    return hasLower && hasUpper && hasDigit && hasSpecial;
  }

  function sanitizeText(value, maxLength = 300) {
    return String(value || "")
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .trim()
      .slice(0, Math.max(1, maxLength));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function sanitizeUrl(value, options = {}) {
    const allowDataImages = options.allowDataImages !== false;
    const text = String(value || "").trim();
    if (!text) return "";
    if (/^\s*javascript:/i.test(text)) return "";

    if (allowDataImages) {
      // Accept only well-formed data:image URIs and reject malformed values
      // like "data:image/jpeg:1" which trigger ERR_INVALID_URL.
      const dataMatch = text.match(/^(data:image\/[a-z0-9.+-]+(?:;[a-z0-9=:+-]+)*,)(.+)$/i);
      if (dataMatch) {
        const prefix = String(dataMatch[1] || "");
        const body = String(dataMatch[2] || "").replace(/\s+/g, "");
        if (body.length < 16) return "";

        if (/;base64,/i.test(prefix) && !/^[a-z0-9+/=]+$/i.test(body)) {
          return "";
        }
        return `${prefix}${body}`;
      }
    }
    if (/^blob:/i.test(text)) return text;
    if (/^https?:\/\//i.test(text)) return text;
    return "";
  }

  async function hashText(value) {
    return sha256Hex(String(value || ""));
  }

  function enforceHttps() {
    const host = String(window.location.hostname || "").toLowerCase();
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "";
    if (!isLocal && window.location.protocol === "http:") {
      const secureUrl = `https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.replace(secureUrl);
    }
  }

  window.BudaSecurity = Object.freeze({
    normalizeEmail,
    hashPassword,
    verifyPassword,
    hashText,
    isHashedPassword,
    isStrongPassword,
    sanitizeText,
    escapeHtml,
    sanitizeUrl,
    enforceHttps,
  });

  enforceHttps();
})();
