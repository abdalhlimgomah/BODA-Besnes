(() => {
  "use strict";

  const CONFIG = window.APP_CONFIG;
  const DIRECT_SIGNUP_NAME = "admen788BOmen";
  const DIRECT_SIGNUP_EMAIL = "admen788BOmen@gmail.com";
  const DIRECT_SIGNUP_PASSWORD = "boda324sdjv-";
  const LOCAL_DIRECT_ACCOUNT_KEY = "local_direct_account_v1";
  const STORAGE = Object.freeze({
    signupData: "signup_data",
    signupEmail: "signup_email",
    signupOtpHash: "signup_otp_hash",
    signupOtpExpiresAt: "signup_otp_expires_at",
    resendAttempts: "resend_attempts",
    maxResendAttempts: "max_resend_attempts",
    resendCooldownUntil: "resend_cooldown_until",
    loginFailCount: "auth_login_fail_count",
    loginLockUntil: "auth_login_lock_until",
  });

  let emailJsReady = false;
  let resendTimer = null;
  let loginInFlight = false;
  let verifyInFlight = false;

  function normalizeEmail(value) {
    return window.BODASecurity?.normalizeEmail
      ? window.BODASecurity.normalizeEmail(value)
      : String(value || "").trim().toLowerCase();
  }

  function safeText(value) {
    return String(value || "").trim();
  }

  function notify(message, type = "error") {
    const holder = document.getElementById("auth-status");
    if (!holder) return;
    holder.classList.remove("hidden", "error", "success", "info");
    holder.classList.add("status-note", type);
    holder.textContent = safeText(message);
  }

  function clearNotify() {
    const holder = document.getElementById("auth-status");
    if (!holder) return;
    holder.textContent = "";
    holder.classList.add("hidden");
    holder.classList.remove("error", "success", "info");
  }

  function setButtonLoading(button, loadingText, isLoading) {
    if (!button) return;
    if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent || "";
    button.disabled = Boolean(isLoading);
    button.textContent = isLoading ? loadingText : button.dataset.defaultText;
  }

  function isDirectAccountEmail(email) {
    return normalizeEmail(email) === normalizeEmail(DIRECT_SIGNUP_EMAIL);
  }

  function isDirectAccountPassword(password) {
    return String(password || "") === DIRECT_SIGNUP_PASSWORD;
  }

  function isDirectAccountSignup(name, email, password) {
    const byName = safeText(name) === DIRECT_SIGNUP_NAME;
    const byEmail = isDirectAccountEmail(email);
    return (byName || byEmail) && isDirectAccountPassword(password);
  }

  function completeDirectLocalLogin(name = "", phone = "") {
    const localUser = buildLocalDirectUser(name, phone);
    const applied = window.PartnerSession?.setCurrentUser?.(localUser);
    if (!applied) throw new Error("failed_to_store_local_user");
    resetLoginAttemptState();
  }

  function readLocalDirectAccount() {
    try {
      const raw = localStorage.getItem(LOCAL_DIRECT_ACCOUNT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function saveLocalDirectAccount(name = "", phone = "") {
    const existing = readLocalDirectAccount() || {};
    const next = {
      email: normalizeEmail(DIRECT_SIGNUP_EMAIL),
      name: safeText(name || existing.name || DIRECT_SIGNUP_NAME),
      phone: safeText(phone || existing.phone || ""),
      createdAt: safeText(existing.createdAt || new Date().toISOString()),
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(LOCAL_DIRECT_ACCOUNT_KEY, JSON.stringify(next));
    return next;
  }

  function buildLocalDirectUser(name = "", phone = "") {
    const stored = saveLocalDirectAccount(name, phone);
    return {
      id: "local-admen788",
      email: normalizeEmail(stored.email || DIRECT_SIGNUP_EMAIL),
      name: safeText(stored.name || DIRECT_SIGNUP_NAME),
      phone: safeText(stored.phone || ""),
      authSource: "local",
      loginTime: new Date().toISOString(),
    };
  }

  async function buildOtpHash(email, otp) {
    const normalizedEmail = normalizeEmail(email);
    const raw = `${String(otp || "")}|${normalizedEmail}|OTP_V1`;
    if (window.BODASecurity?.hashText) {
      return window.BODASecurity.hashText(raw);
    }
    return raw;
  }

  async function setSignupSession(data, otp) {
    const otpHash = await buildOtpHash(data.email, otp);
    sessionStorage.setItem(STORAGE.signupData, JSON.stringify(data));
    sessionStorage.setItem(STORAGE.signupEmail, data.email);
    sessionStorage.setItem(STORAGE.signupOtpHash, otpHash);
    sessionStorage.setItem(STORAGE.signupOtpExpiresAt, String(Date.now() + CONFIG.OTP_TTL_MS));
    sessionStorage.setItem(STORAGE.resendAttempts, "0");
    sessionStorage.setItem(STORAGE.maxResendAttempts, String(CONFIG.OTP_MAX_RESENDS));
    sessionStorage.setItem(STORAGE.resendCooldownUntil, String(Date.now() + CONFIG.OTP_RESEND_COOLDOWN_MS));
  }

  function clearSignupSession() {
    Object.values(STORAGE).forEach((key) => sessionStorage.removeItem(key));
  }

  function getSignupData() {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE.signupData) || "{}");
    } catch {
      return {};
    }
  }

  function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  function ensureEmailJsReady() {
    if (!window.emailjs) throw new Error("EmailJS unavailable");
    if (emailJsReady) return;
    window.emailjs.init({ publicKey: CONFIG.EMAILJS_PUBLIC_KEY });
    emailJsReady = true;
  }

  async function sendOtpEmail(email, otp) {
    ensureEmailJsReady();
    const expiration = new Date(Date.now() + CONFIG.OTP_TTL_MS).toLocaleTimeString("ar-EG", {
      hour: "2-digit",
      minute: "2-digit",
    });
    await window.emailjs.send(CONFIG.EMAILJS_SERVICE_ID, CONFIG.EMAILJS_TEMPLATE_ID, {
      email,
      passcode: otp,
      time: expiration,
    });
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
  }

  function isValidPhone(phone) {
    const value = String(phone || "").trim();
    return /^(010|011|012|015)\d{8}$/.test(value) || /^\+?[0-9]{9,15}$/.test(value);
  }

  function isInvalidLoginCredentialsError(error) {
    const code = safeText(error?.code).toLowerCase();
    const message = String(error?.message || "").toLowerCase();
    const status = Number(error?.status || 0);

    return (
      code === "invalid_credentials" ||
      code === "invalid_grant" ||
      message.includes("invalid login credentials") ||
      (status === 400 && message.includes("invalid"))
    );
  }

  function isEmailNotConfirmedError(error) {
    const message = String(error?.message || "").toLowerCase();
    return message.includes("email not confirmed") || message.includes("not confirmed");
  }

  function extractRetryAfterSeconds(error) {
    const message = String(error?.message || "");
    const match = message.match(/after\s+(\d+)\s+seconds?/i);
    if (match && match[1]) {
      const seconds = Number(match[1]);
      if (Number.isFinite(seconds) && seconds > 0) return seconds;
    }
    return 0;
  }

  function isRateLimitError(error) {
    const status = Number(error?.status || 0);
    const message = String(error?.message || "").toLowerCase();
    return (
      status === 429 ||
      message.includes("too many requests") ||
      message.includes("for security purposes")
    );
  }

  function getLockSeconds() {
    const lockUntil = Number(localStorage.getItem(STORAGE.loginLockUntil) || 0);
    return Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
  }

  function registerLoginFailure() {
    const currentFail = Number(localStorage.getItem(STORAGE.loginFailCount) || 0) + 1;
    localStorage.setItem(STORAGE.loginFailCount, String(currentFail));
    if (currentFail >= CONFIG.LOGIN_MAX_ATTEMPTS) {
      localStorage.setItem(STORAGE.loginLockUntil, String(Date.now() + CONFIG.LOGIN_LOCK_MS));
    }
  }

  function resetLoginAttemptState() {
    localStorage.removeItem(STORAGE.loginFailCount);
    localStorage.removeItem(STORAGE.loginLockUntil);
  }

  async function handleSignupSubmit(event) {
    event.preventDefault();
    clearNotify();

    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');

    const name = window.BODASecurity?.sanitizeText
      ? window.BODASecurity.sanitizeText(document.getElementById("signupName")?.value, 120)
      : safeText(document.getElementById("signupName")?.value);
    const phone = safeText(document.getElementById("signupPhone")?.value);
    const email = normalizeEmail(document.getElementById("signupEmail")?.value);
    const password = document.getElementById("signupPassword")?.value || "";
    const confirm = document.getElementById("signupConfirm")?.value || "";

    if (!name || !phone || !email || !password || !confirm) {
      notify("يرجى تعبئة كل الحقول.", "error");
      return;
    }

    if (!isValidEmail(email)) {
      notify("صيغة البريد الإلكتروني غير صحيحة.", "error");
      return;
    }

    if (!isValidPhone(phone)) {
      notify("رقم الهاتف غير صحيح.", "error");
      return;
    }

    if (password !== confirm) {
      notify("كلمتا المرور غير متطابقتين.", "error");
      return;
    }

    const directSignup = isDirectAccountSignup(name, email, password);

    if (!directSignup && window.BODASecurity?.isStrongPassword && !window.BODASecurity.isStrongPassword(password)) {
      notify("استخدم كلمة مرور قوية: 8 أحرف مع حرف كبير وصغير ورقم ورمز.", "error");
      return;
    }

    // الحساب المحلي الخاص يدخل مباشرة بدون أي علاقة بـ Supabase.
    if (isDirectAccountEmail(email) && !isDirectAccountPassword(password)) {
      notify("كلمة المرور غير صحيحة للحساب المحلي المحدد.", "error");
      return;
    }
    if (directSignup) {
      setButtonLoading(button, "جارٍ تسجيل الدخول...", true);
      try {
        completeDirectLocalLogin(name, phone);
        notify("تم تسجيل الدخول بنجاح.", "success");
        setTimeout(() => window.PartnerSession.goTo(window.APP_ROUTES.dashboardProducts), 450);
      } catch (error) {
        console.error("direct signup login error", error);
        notify("تعذر تسجيل الدخول الآن.", "error");
      } finally {
        setButtonLoading(button, "", false);
      }
      return;
    }

    setButtonLoading(button, "جارٍ إرسال الكود...", true);
    try {
      const otp = generateOtp();

      await sendOtpEmail(email, otp);
      await setSignupSession({ name, phone, email, password_hash: password }, otp);

      notify("تم إرسال رمز التحقق إلى بريدك.", "success");
      setTimeout(() => window.PartnerSession.goTo(window.APP_ROUTES.verify), 500);
    } catch (error) {
      console.error("signup otp error", error);
      notify("تعذر إرسال رمز التحقق الآن. حاول لاحقًا.", "error");
    } finally {
      setButtonLoading(button, "", false);
    }
  }

  function bindOtpInputs() {
    const container = document.getElementById("otpContainer");
    if (!container) return;
    const inputs = Array.from(container.querySelectorAll(".otp-digit"));
    if (!inputs.length) return;

    inputs[0].focus();

    inputs.forEach((input, index) => {
      input.addEventListener("input", (event) => {
        const value = String(event.target.value || "").replace(/\D/g, "").slice(0, 1);
        event.target.value = value;
        if (value && index < inputs.length - 1) inputs[index + 1].focus();
      });

      input.addEventListener("keydown", (event) => {
        if (event.key === "Backspace" && !input.value && index > 0) {
          inputs[index - 1].focus();
        }
      });
    });

    container.addEventListener("paste", (event) => {
      const pasted = (event.clipboardData?.getData("text") || "")
        .replace(/\D/g, "")
        .slice(0, CONFIG.OTP_LENGTH);
      if (!pasted) return;

      event.preventDefault();
      inputs.forEach((input, idx) => {
        input.value = pasted[idx] || "";
      });
      inputs[Math.min(pasted.length, inputs.length - 1)].focus();
    });
  }

  function readOtpFromInputs() {
    const inputs = Array.from(document.querySelectorAll(".otp-digit"));
    return inputs.map((input) => safeText(input.value)).join("");
  }

  function getResendAttempts() {
    return Number(sessionStorage.getItem(STORAGE.resendAttempts) || 0);
  }

  function getResendMaxAttempts() {
    return Number(sessionStorage.getItem(STORAGE.maxResendAttempts) || CONFIG.OTP_MAX_RESENDS);
  }

  function getResendCooldownUntil() {
    return Number(sessionStorage.getItem(STORAGE.resendCooldownUntil) || 0);
  }

  function renderResendState() {
    const resendBtn = document.getElementById("resendOtpBtn");
    const countdown = document.getElementById("resendCountdown");
    const info = document.getElementById("resendInfo");
    if (!resendBtn || !countdown || !info) return;

    const attempts = getResendAttempts();
    const maxAttempts = getResendMaxAttempts();
    const remaining = Math.max(0, maxAttempts - attempts);
    info.textContent = remaining
      ? `المحاولات المتبقية: ${remaining}`
      : "تم استهلاك كل محاولات إعادة الإرسال.";

    if (resendTimer) {
      clearInterval(resendTimer);
      resendTimer = null;
    }

    const tick = () => {
      const cooldownMs = getResendCooldownUntil() - Date.now();
      const cooldownSec = Math.ceil(cooldownMs / 1000);
      if (remaining <= 0) {
        resendBtn.disabled = true;
        countdown.classList.add("hidden");
        return;
      }

      if (cooldownSec > 0) {
        resendBtn.disabled = true;
        countdown.classList.remove("hidden");
        countdown.textContent = `(${cooldownSec}ث)`;
      } else {
        resendBtn.disabled = false;
        countdown.classList.add("hidden");
      }
    };

    tick();
    resendTimer = setInterval(tick, 1000);
  }

  async function handleResendOtp() {
    const attempts = getResendAttempts();
    const maxAttempts = getResendMaxAttempts();
    if (attempts >= maxAttempts) {
      notify("لا توجد محاولات إعادة إرسال متبقية.", "error");
      return;
    }

    if (getResendCooldownUntil() > Date.now()) {
      notify("انتظر قليلًا قبل إعادة الإرسال.", "info");
      return;
    }

    const data = getSignupData();
    if (!data.email) {
      notify("انتهت الجلسة. أعد التسجيل من البداية.", "error");
      setTimeout(() => window.PartnerSession.goTo(window.APP_ROUTES.signup), 600);
      return;
    }

    const resendBtn = document.getElementById("resendOtpBtn");
    setButtonLoading(resendBtn, "جارٍ الإرسال...", true);
    try {
      const otp = generateOtp();
      await sendOtpEmail(data.email, otp);
      const otpHash = await buildOtpHash(data.email, otp);
      sessionStorage.setItem(STORAGE.signupOtpHash, otpHash);
      sessionStorage.setItem(STORAGE.signupOtpExpiresAt, String(Date.now() + CONFIG.OTP_TTL_MS));
      sessionStorage.setItem(STORAGE.resendAttempts, String(attempts + 1));
      sessionStorage.setItem(STORAGE.resendCooldownUntil, String(Date.now() + CONFIG.OTP_RESEND_COOLDOWN_MS));
      notify("تم إرسال كود جديد بنجاح.", "success");
    } catch (error) {
      console.error("resend otp error", error);
      notify("تعذر إعادة إرسال الكود الآن.", "error");
    } finally {
      setButtonLoading(resendBtn, "", false);
      renderResendState();
    }
  }

  async function handleVerifySubmit(event) {
    event.preventDefault();
    clearNotify();

    if (verifyInFlight) return;

    const button = event.currentTarget.querySelector('button[type="submit"]');
    const code = readOtpFromInputs();
    if (!/^\d{6}$/.test(code)) {
      notify("يرجى إدخال كود مكوّن من 6 أرقام.", "error");
      return;
    }

    const expectedHash = sessionStorage.getItem(STORAGE.signupOtpHash) || "";
    const expiresAt = Number(sessionStorage.getItem(STORAGE.signupOtpExpiresAt) || 0);
    if (!expectedHash || !expiresAt || Date.now() > expiresAt) {
      notify("انتهت صلاحية الكود. أعد الإرسال.", "error");
      return;
    }

    const email = sessionStorage.getItem(STORAGE.signupEmail) || "";
    const enteredHash = await buildOtpHash(email, code);
    if (enteredHash !== expectedHash) {
      notify("الكود غير صحيح.", "error");
      return;
    }

    const data = getSignupData();
    if (!data.email || !data.password_hash || !data.name) {
      notify("بيانات التسجيل غير مكتملة. أعد التسجيل من البداية.", "error");
      setTimeout(() => window.PartnerSession.goTo(window.APP_ROUTES.signup), 700);
      return;
    }

    if (isDirectAccountEmail(data.email)) {
      if (!isDirectAccountPassword(data.password_hash)) {
        notify("كلمة المرور غير صحيحة للحساب المحلي المحدد.", "error");
        return;
      }

      setButtonLoading(button, "جارٍ تسجيل الدخول...", true);
      verifyInFlight = true;
      try {
        completeDirectLocalLogin(data.name, data.phone);
        clearSignupSession();
        notify("تم تسجيل الدخول بنجاح.", "success");
        setTimeout(() => window.PartnerSession.goTo(window.APP_ROUTES.dashboardProducts), 450);
      } catch (error) {
        console.error("direct verify login error", error);
        notify("تعذر تسجيل الدخول الآن.", "error");
      } finally {
        verifyInFlight = false;
        setButtonLoading(button, "", false);
      }
      return;
    }

    verifyInFlight = true;
    setButtonLoading(button, "جارٍ إنشاء الحساب...", true);
    try {
      const passwordHash = data.password_hash;
      let user = null;

      // إذا كان الحساب أُنشئ سابقًا، تجنّب signUp لتفادي rate limit.
      try {
        const signInExisting = await window.PartnerAPI.authSignIn({
          email: data.email,
          password: passwordHash,
        });
        user = signInExisting?.user || null;
      } catch (signInError) {
        if (isEmailNotConfirmedError(signInError)) {
          notify("الحساب موجود لكن البريد غير مؤكد. تحقق من رسالة التفعيل أولًا.", "info");
          return;
        }
        if (!isInvalidLoginCredentialsError(signInError)) {
          throw signInError;
        }
      }

      if (!user) {
        try {
          const signUpResult = await window.PartnerAPI.authSignUp({
            email: data.email,
            password: passwordHash,
            fullName: data.name,
            phone: data.phone,
          });
          user = signUpResult?.user || null;
        } catch (signUpError) {
          if (isRateLimitError(signUpError)) {
            notify("تعذر إكمال إنشاء الحساب الآن بسبب ضغط مؤقت. سيتم تحويلك لتسجيل الدخول.", "info");
            setTimeout(() => {
              window.PartnerSession.goTo(window.APP_ROUTES.login, {
                email: data.email,
                reason: "rate_limit",
              });
            }, 900);
            return;
          }
          const msg = String(signUpError?.message || "").toLowerCase();
          if (msg.includes("already") || msg.includes("registered") || (msg.includes("email") && msg.includes("exists"))) {
            // حالة سباق: الحساب موجود فعلًا، جرّب تسجيل الدخول مباشرة.
            try {
              const signInAfterExists = await window.PartnerAPI.authSignIn({
                email: data.email,
                password: passwordHash,
              });
              user = signInAfterExists?.user || null;
            } catch (recoverError) {
              if (isEmailNotConfirmedError(recoverError)) {
                notify("الحساب موجود لكن البريد غير مؤكد. تحقق من رسالة التفعيل أولًا.", "info");
                return;
              }
              if (!isInvalidLoginCredentialsError(recoverError)) {
                throw recoverError;
              }
            }
          } else {
            throw signUpError;
          }
        }
      }

      if (!user) {
        notify("تعذر إكمال إنشاء الحساب الآن. جرّب تسجيل الدخول.", "error");
        return;
      }

      try {
        await window.PartnerAPI.upsertProfile({
          email: data.email,
          full_name: data.name,
          phone: data.phone,
        }, user);
      } catch (profileError) {
        console.warn("profile upsert skipped", profileError);
      }

      let currentUser = await window.PartnerSession.refreshFromAuth();
      if (!currentUser) {
        try {
          await window.PartnerAPI.authSignIn({
            email: data.email,
            password: passwordHash,
          });
        } catch (finalSignInError) {
          if (isEmailNotConfirmedError(finalSignInError)) {
            notify("تم إنشاء الحساب لكن يلزم تأكيد البريد من رسالة Supabase قبل الدخول.", "info");
            return;
          }
        }
        currentUser = await window.PartnerSession.refreshFromAuth();
      }

      if (!currentUser) {
        notify("تم إنشاء الحساب لكن تعذر فتح جلسة دخول الآن. جرّب تسجيل الدخول.", "info");
        return;
      }

      clearSignupSession();
      notify("تم إنشاء الحساب بنجاح.", "success");
      setTimeout(() => window.PartnerSession.redirectAfterAuth(data.email), 500);
    } catch (error) {
      console.error("verify signup error", error);
      notify("تعذر إنشاء الحساب الآن.", "error");
    } finally {
      verifyInFlight = false;
      setButtonLoading(button, "", false);
    }
  }

  async function tryMigrateLegacyAccount(email, password) {
    if (!window.PartnerAPI?.findLegacyUserForLogin) {
      return { user: null, reason: "unsupported" };
    }

    const legacy = await window.PartnerAPI.findLegacyUserForLogin({ email, password });
    if (!legacy) {
      return { user: null, reason: "not_found" };
    }

    if (!legacy.passwordVerified) {
      return { user: null, reason: "password_not_verifiable" };
    }
    return {
      user: null,
      reason: "legacy_signup_required",
      legacy: {
        email: normalizeEmail(legacy.email || email),
        name: safeText(legacy.name),
        phone: safeText(legacy.phone),
      },
    };
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    clearNotify();

    if (loginInFlight) return;

    const lockSec = getLockSeconds();
    if (lockSec > 0) {
      notify(`تم إيقاف المحاولات مؤقتًا. حاول بعد ${lockSec} ثانية.`, "info");
      return;
    }

    const button = event.currentTarget.querySelector('button[type="submit"]');
    const email = normalizeEmail(document.getElementById("loginEmail")?.value);
    const password = String(document.getElementById("loginPassword")?.value || "").trim();

    if (!email || !password) {
      notify("أدخل البريد الإلكتروني وكلمة المرور.", "error");
      return;
    }

    if (!isValidEmail(email)) {
      notify("صيغة البريد الإلكتروني غير صحيحة.", "error");
      return;
    }

    if (isDirectAccountEmail(email)) {
      if (!isDirectAccountPassword(password)) {
        registerLoginFailure();
        notify("البريد الإلكتروني أو كلمة المرور غير صحيحة.", "error");
        return;
      }
      try {
        completeDirectLocalLogin();
      } catch {
        notify("تعذر حفظ بيانات الحساب المحلي.", "error");
        return;
      }
      notify("تم تسجيل الدخول بنجاح.", "success");
      setTimeout(() => window.PartnerSession.goTo(window.APP_ROUTES.dashboardProducts), 450);
      return;
    }

    loginInFlight = true;
    setButtonLoading(button, "جارٍ تسجيل الدخول...", true);
    try {
      const attemptSignIn = async (pass) => {
        try {
          const { user } = await window.PartnerAPI.authSignIn({
            email,
            password: pass,
          });
          return user;
        } catch (error) {
          if (isInvalidLoginCredentialsError(error)) {
            return null;
          }
          throw error;
        }
      };

      let user = await attemptSignIn(password);

      let legacyRecovery = null;
      if (!user) {
        try {
          legacyRecovery = await tryMigrateLegacyAccount(email, password);
        } catch (legacyError) {
          console.warn("legacy login check failed", legacyError);
        }
      }

      if (!user) {
        if (legacyRecovery?.reason === "password_not_verifiable") {
          notify("الحساب موجود لكنه غير مرتبط بنظام تسجيل الدخول الحالي. تواصل مع الدعم لنقل الحساب.", "error");
          return;
        }
        if (legacyRecovery?.reason === "legacy_signup_required") {
          notify("الحساب موجود في النظام القديم. تم إيقاف الإنشاء التلقائي. سيتم تحويلك لصفحة إنشاء حساب.", "info");
          const query = { email };
          const legacyName = safeText(legacyRecovery?.legacy?.name);
          const legacyPhone = safeText(legacyRecovery?.legacy?.phone);
          if (legacyName) query.name = legacyName;
          if (legacyPhone) query.phone = legacyPhone;
          setTimeout(() => window.PartnerSession.goTo(window.APP_ROUTES.signup, query), 900);
          return;
        }
        registerLoginFailure();
        notify("البريد الإلكتروني أو كلمة المرور غير صحيحة.", "error");
        return;
      }

      resetLoginAttemptState();
      const currentUser = await window.PartnerSession.refreshFromAuth();
      if (!currentUser) {
        notify("تم التحقق من البيانات لكن تعذر إنشاء جلسة دخول. أعد المحاولة.", "error");
        return;
      }
      notify("تم تسجيل الدخول بنجاح.", "success");
      setTimeout(() => window.PartnerSession.goTo(window.APP_ROUTES.partnership), 450);
    } catch (error) {
      if (isRateLimitError(error)) {
        const waitSeconds = extractRetryAfterSeconds(error) || 60;
        notify(`يرجى الانتظار ${waitSeconds} ثانية قبل المحاولة التالية.`, "info");
        return;
      }
      registerLoginFailure();
      console.error("login error", error);
      const message = String(error?.message || "").trim();
      if (message) {
        notify(message, "error");
      } else {
        notify("تعذر تسجيل الدخول الآن.", "error");
      }
    } finally {
      loginInFlight = false;
      setButtonLoading(button, "", false);
    }
  }

  function initSignupPage() {
    const form = document.getElementById("signupForm");
    if (!form) return;

    const params = new URLSearchParams(window.location.search);
    const prefillEmail = normalizeEmail(params.get("email"));
    const prefillName = safeText(params.get("name"));
    const prefillPhone = safeText(params.get("phone"));

    if (prefillEmail && isValidEmail(prefillEmail)) {
      const emailInput = document.getElementById("signupEmail");
      if (emailInput && !safeText(emailInput.value)) emailInput.value = prefillEmail;
    }
    if (prefillName) {
      const nameInput = document.getElementById("signupName");
      if (nameInput && !safeText(nameInput.value)) nameInput.value = prefillName;
    }
    if (prefillPhone) {
      const phoneInput = document.getElementById("signupPhone");
      if (phoneInput && !safeText(phoneInput.value)) phoneInput.value = prefillPhone;
    }

    form.addEventListener("submit", handleSignupSubmit);
  }

  function initVerifyPage() {
    const form = document.getElementById("verifyForm");
    if (!form) return;

    const email = sessionStorage.getItem(STORAGE.signupEmail) || "";
    const emailHolder = document.getElementById("verifyEmail");
    if (emailHolder) emailHolder.textContent = email || "-";

    if (!email) {
      notify("انتهت جلسة التسجيل. أعد المحاولة من البداية.", "error");
      setTimeout(() => window.PartnerSession.goTo(window.APP_ROUTES.signup), 700);
      return;
    }

    bindOtpInputs();
    renderResendState();
    form.addEventListener("submit", handleVerifySubmit);
    document.getElementById("resendOtpBtn")?.addEventListener("click", handleResendOtp);
  }

  async function initLoginPage() {
    const form = document.getElementById("loginForm");
    if (!form) return;

    const params = new URLSearchParams(window.location.search);
    const prefillEmail = normalizeEmail(params.get("email"));
    if (prefillEmail && isValidEmail(prefillEmail)) {
      const emailInput = document.getElementById("loginEmail");
      if (emailInput && !safeText(emailInput.value)) emailInput.value = prefillEmail;
    }

    const reason = safeText(params.get("reason")).toLowerCase();
    if (reason === "rate_limit") {
      notify("تم تحويلك لتسجيل الدخول بسبب ضغط مؤقت في إنشاء الحساب.", "info");
    }

    const current = await window.PartnerSession.refreshFromAuth();
    if (current) {
      const target = isDirectAccountEmail(current.email)
        ? window.APP_ROUTES.dashboardProducts
        : window.APP_ROUTES.partnership;
      window.PartnerSession.goTo(target);
      return;
    }

    form.addEventListener("submit", handleLoginSubmit);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const page = document.body?.dataset?.page || "";
    if (page === "signup") initSignupPage();
    if (page === "verify") initVerifyPage();
    if (page === "login") initLoginPage();
  });

  window.addEventListener("beforeunload", () => {
    if (resendTimer) clearInterval(resendTimer);
  });
})();
