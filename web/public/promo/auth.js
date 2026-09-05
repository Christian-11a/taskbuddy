(function () {
  "use strict";

  var overlay = document.querySelector("[data-auth-overlay]");
  if (!overlay) return;

  var panels = {
    welcome: document.getElementById("panel-welcome"),
    signin: document.getElementById("panel-signin"),
    signup: document.getElementById("panel-signup"),
    confirm: document.getElementById("panel-confirm"),
  };

  var HASH_TO_PANEL = { "#join": "welcome", "#login": "signin", "#signup": "signup" };

  function showPanel(name) {
    Object.keys(panels).forEach(function (key) {
      if (panels[key]) panels[key].hidden = key !== name;
    });
  }

  function syncFromHash() {
    var panelName = HASH_TO_PANEL[window.location.hash];
    if (panelName) {
      showPanel(panelName);
      overlay.hidden = false;
      document.documentElement.classList.add("has-modal-open");
      document.body.classList.add("has-modal-open");
      var autofocusTarget = panels[panelName].querySelector("input, button");
      if (autofocusTarget) autofocusTarget.focus();
    } else if (!window.__promoModalPinnedOpen) {
      overlay.hidden = true;
      document.documentElement.classList.remove("has-modal-open");
      document.body.classList.remove("has-modal-open");
    }
  }

  function closeModal() {
    if (window.location.hash) {
      history.pushState("", document.title, window.location.pathname + window.location.search);
    }
    overlay.hidden = true;
    document.documentElement.classList.remove("has-modal-open");
    document.body.classList.remove("has-modal-open");
  }

  window.addEventListener("hashchange", syncFromHash);
  syncFromHash();

  document.querySelectorAll("[data-close-modal]").forEach(function (btn) {
    btn.addEventListener("click", closeModal);
  });

  document.querySelectorAll("[data-back-to-welcome]").forEach(function (btn) {
    btn.addEventListener("click", function () { window.location.hash = "join"; });
  });

  overlay.addEventListener("click", function (event) {
    if (event.target === overlay) closeModal();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !overlay.hidden) closeModal();
  });

  // ── Password show/hide ──────────────────────────────────────────────────
  document.querySelectorAll("[data-password-toggle]").forEach(function (toggle) {
    var input = toggle.closest(".auth-input-wrap").querySelector("input");
    toggle.addEventListener("click", function () {
      var showing = input.type === "text";
      input.type = showing ? "password" : "text";
      toggle.setAttribute("aria-pressed", String(!showing));
      toggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    });
  });

  function setInvalid(field, invalid) {
    if (!field) return;
    field.setAttribute("data-invalid", invalid ? "true" : "false");
  }

  function showStatus(el, message, isError) {
    el.textContent = message;
    el.className = "auth-status is-visible" + (isError ? " is-error" : "");
  }

  function clearStatus(el) {
    el.className = "auth-status";
    el.textContent = "";
  }

  function setLoading(button, loading) {
    if (loading) {
      button.dataset.originalLabel = button.textContent;
      button.setAttribute("disabled", "true");
      button.setAttribute("data-state", "loading");
      button.textContent = "Checking…";
    } else {
      button.removeAttribute("disabled");
      button.removeAttribute("data-state");
      if (button.dataset.originalLabel) button.textContent = button.dataset.originalLabel;
    }
  }

  async function postJson(path, body) {
    var res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    var data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      var message = (data && data.message) || "Something went wrong. Please try again.";
      throw new Error(message);
    }
    return data;
  }

  // ── Sign In panel ───────────────────────────────────────────────────────
  var signinForm = document.getElementById("signin-form");
  var signinStatus = document.querySelector("[data-signin-status]");

  signinForm.addEventListener("submit", function (event) {
    event.preventDefault();
    clearStatus(signinStatus);

    var emailInput = document.getElementById("signin-email");
    var passwordInput = document.getElementById("signin-password");
    var emailField = signinForm.querySelector('[data-field="email"]');
    var passwordField = signinForm.querySelector('[data-field="password"]');

    var emailValid = emailInput.checkValidity();
    var passwordValid = passwordInput.checkValidity();
    setInvalid(emailField, !emailValid);
    setInvalid(passwordField, !passwordValid);

    if (!emailValid || !passwordValid) {
      showStatus(signinStatus, "Check the highlighted fields above.", true);
      return;
    }

    var button = signinForm.querySelector(".auth-submit");
    setLoading(button, true);
    postJson("/api/auth/login", { email: emailInput.value, password: passwordInput.value })
      .then(function () {
        window.location.href = "/account";
      })
      .catch(function (err) {
        setLoading(button, false);
        showStatus(signinStatus, err.message, true);
      });
  });

  // ── Sign Up panel ───────────────────────────────────────────────────────
  var signupForm = document.getElementById("signup-form");
  var signupStatus = document.querySelector("[data-signup-status]");
  var categoryField = signupForm.querySelector('[data-field="category"]');
  var providerConsent = signupForm.querySelector("[data-provider-only]");
  var roleOptions = document.querySelectorAll("[data-role-option]");
  var currentRole = "homeowner";

  var CATEGORY_IDS = { Plumbing: 1, Cleaning: 2, Handyman: 3, Manicure: 4, Pedicure: 5 };

  function updateRoleFields() {
    var isProvider = currentRole === "provider";
    if (categoryField) categoryField.hidden = !isProvider;
    if (providerConsent) providerConsent.hidden = !isProvider;
  }

  roleOptions.forEach(function (btn) {
    btn.addEventListener("click", function () {
      roleOptions.forEach(function (b) {
        b.classList.toggle("is-active", b === btn);
        b.setAttribute("aria-selected", String(b === btn));
      });
      currentRole = btn.getAttribute("data-role-option");
      updateRoleFields();
    });
  });

  // ── Email confirmation panel (shown when register() returns session: null) ──
  var confirmPanel = panels.confirm;
  var confirmEmailInput = document.getElementById("confirm-email");
  var confirmCodeInput = document.getElementById("confirm-code");
  var confirmStatus = document.querySelector("[data-confirm-status]");
  var confirmForm = document.getElementById("confirm-form");

  function openConfirmPanel(email) {
    if (confirmEmailInput) confirmEmailInput.value = email;
    var emailLabel = confirmPanel && confirmPanel.querySelector("[data-confirm-email-label]");
    if (emailLabel) emailLabel.textContent = email;
    window.__promoModalPinnedOpen = true;
    showPanel("confirm");
    overlay.hidden = false;
    document.documentElement.classList.add("has-modal-open");
    document.body.classList.add("has-modal-open");
  }

  if (confirmForm) {
    confirmForm.addEventListener("submit", function (event) {
      event.preventDefault();
      clearStatus(confirmStatus);
      var button = confirmForm.querySelector(".auth-submit");
      setLoading(button, true);
      postJson("/api/auth/verify-email-otp", {
        email: confirmEmailInput.value,
        token: confirmCodeInput.value,
      })
        .then(function () {
          window.__promoModalPinnedOpen = false;
          window.location.href = "/account";
        })
        .catch(function (err) {
          setLoading(button, false);
          showStatus(confirmStatus, err.message, true);
        });
    });
  }

  signupForm.addEventListener("submit", function (event) {
    event.preventDefault();
    clearStatus(signupStatus);

    var nameInput = document.getElementById("signup-name");
    var emailInput = document.getElementById("signup-email");
    var passwordInput = document.getElementById("signup-password");
    var confirmInput = document.getElementById("signup-confirm");
    var categorySelect = document.getElementById("signup-category");

    var nameField = signupForm.querySelector('[data-field="name"]');
    var emailField = signupForm.querySelector('[data-field="email"]');
    var passwordField = signupForm.querySelector('[data-field="password"]');
    var confirmField = signupForm.querySelector('[data-field="confirm"]');

    var nameValid = nameInput.checkValidity();
    var emailValid = emailInput.checkValidity();
    var passwordValid = passwordInput.checkValidity();
    var confirmValid = confirmInput.value === passwordInput.value && confirmInput.value.length > 0;
    var consentsValid = Array.prototype.every.call(
      signupForm.querySelectorAll(".auth-consent:not([hidden]) input[required]"),
      function (checkbox) { return checkbox.checked; }
    );

    setInvalid(nameField, !nameValid);
    setInvalid(emailField, !emailValid);
    setInvalid(passwordField, !passwordValid);
    setInvalid(confirmField, !confirmValid);

    if (!nameValid || !emailValid || !passwordValid || !confirmValid || !consentsValid) {
      showStatus(
        signupStatus,
        consentsValid ? "Check the highlighted fields above." : "Please accept the required consents to continue.",
        true
      );
      return;
    }

    var isProvider = currentRole === "provider";
    var consents = signupForm.querySelectorAll(".auth-consent input[type=checkbox]");
    var payload = {
      email: emailInput.value,
      password: passwordInput.value,
      full_name: nameInput.value,
      role: isProvider ? "provider" : "client",
      consented_terms: consents[0] ? consents[0].checked : false,
      consented_privacy: consents[1] ? consents[1].checked : false,
      consented_data_collection: consents[2] ? consents[2].checked : false,
    };
    if (isProvider) {
      payload.category_id = CATEGORY_IDS[categorySelect.value] || undefined;
      payload.consented_biometric = consents[3] ? consents[3].checked : false;
    }

    var button = signupForm.querySelector(".auth-submit");
    setLoading(button, true);
    postJson("/api/auth/register", payload)
      .then(function (data) {
        setLoading(button, false);
        if (data && data.needsEmailConfirmation) {
          openConfirmPanel(emailInput.value);
        } else {
          window.location.href = "/account";
        }
      })
      .catch(function (err) {
        setLoading(button, false);
        showStatus(signupStatus, err.message, true);
      });
  });
})();
