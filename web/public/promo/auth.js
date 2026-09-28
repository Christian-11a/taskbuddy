(function () {
  "use strict";

  var overlay = document.querySelector("[data-auth-overlay]");
  if (!overlay) return;
  var modal = overlay.querySelector(".auth-modal");
  var modalAncestors = [];
  var ancestor = overlay;
  while (ancestor && ancestor !== document.body) {
    modalAncestors.push(ancestor);
    ancestor = ancestor.parentElement;
  }
  var backgroundA11yState = [];
  modalAncestors.forEach(function (modalAncestor) {
    var parent = modalAncestor.parentElement;
    if (!parent) return;
    Array.prototype.forEach.call(parent.children, function (element) {
      if (modalAncestors.indexOf(element) !== -1) return;
      if (backgroundA11yState.some(function (entry) { return entry.element === element; })) return;
      backgroundA11yState.push({
        element: element,
        ariaHidden: element.getAttribute("aria-hidden"),
        inert: element.hasAttribute("inert"),
      });
    });
  });
  var modalOpener = null;
  var activePanelName = null;
  var pendingDiscardAction = null;
  var discardReturnFocus = null;

  var discardPrompt = document.createElement("div");
  discardPrompt.className = "auth-discard-prompt";
  discardPrompt.setAttribute("data-auth-discard-prompt", "");
  discardPrompt.setAttribute("role", "alertdialog");
  discardPrompt.setAttribute("aria-modal", "true");
  discardPrompt.setAttribute("aria-labelledby", "auth-discard-title");
  discardPrompt.setAttribute("aria-describedby", "auth-discard-description");
  discardPrompt.hidden = true;
  discardPrompt.innerHTML =
    '<div class="auth-discard-prompt__card">' +
      '<h2 id="auth-discard-title">Leave this form?</h2>' +
      '<p id="auth-discard-description">The information you entered has not been saved.</p>' +
      '<div class="auth-discard-prompt__actions">' +
        '<button class="button button--quiet" type="button" data-discard-cancel>Keep editing</button>' +
        '<button class="button button--primary" type="button" data-discard-confirm>Discard</button>' +
      '</div>' +
    '</div>';
  modal.appendChild(discardPrompt);
  var discardCancelButton = discardPrompt.querySelector("[data-discard-cancel]");
  var discardConfirmButton = discardPrompt.querySelector("[data-discard-confirm]");

  var panels = {
    welcome: document.getElementById("panel-welcome"),
    signin: document.getElementById("panel-signin"),
    signup: document.getElementById("panel-signup"),
    confirm: document.getElementById("panel-confirm"),
    forgot: document.getElementById("panel-forgot"),
    reset: document.getElementById("panel-reset"),
    doc: document.getElementById("panel-doc"),
  };

  var HASH_TO_PANEL = { "#join": "welcome", "#login": "signin", "#signup": "signup", "#forgot": "forgot" };

  function showPanel(name) {
    Object.keys(panels).forEach(function (key) {
      if (panels[key]) panels[key].hidden = key !== name;
    });
    activePanelName = name;

    var heading = panels[name] && panels[name].querySelector(".auth-heading");
    var lede = panels[name] && panels[name].querySelector(".auth-lede");
    document.querySelectorAll(".auth-heading").forEach(function (element) {
      if (element !== heading && element.id === "auth-modal-heading") element.removeAttribute("id");
    });
    document.querySelectorAll(".auth-lede").forEach(function (element) {
      if (element !== lede && element.id === "auth-modal-description") element.removeAttribute("id");
    });

    if (heading) {
      heading.id = "auth-modal-heading";
      modal.removeAttribute("aria-label");
      modal.setAttribute("aria-labelledby", "auth-modal-heading");
    } else {
      modal.removeAttribute("aria-labelledby");
      modal.setAttribute("aria-label", "TaskBuddy account");
    }
    if (lede) {
      lede.id = "auth-modal-description";
      modal.setAttribute("aria-describedby", "auth-modal-description");
    } else {
      modal.removeAttribute("aria-describedby");
    }
  }

  function getFocusableElements() {
    if (!modal) return [];
    var scope = discardPrompt && !discardPrompt.hidden ? discardPrompt : modal;
    return Array.prototype.filter.call(
      scope.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"),
      function (element) {
        return element.getClientRects().length > 0;
      }
    );
  }

  function setBackgroundInert(inert) {
    backgroundA11yState.forEach(function (entry) {
      if (inert) {
        entry.element.setAttribute("inert", "");
        entry.element.setAttribute("aria-hidden", "true");
      } else {
        if (entry.inert) entry.element.setAttribute("inert", "");
        else entry.element.removeAttribute("inert");
        if (entry.ariaHidden === null) entry.element.removeAttribute("aria-hidden");
        else entry.element.setAttribute("aria-hidden", entry.ariaHidden);
      }
    });
  }

  function openModalShell() {
    if (overlay.hidden && document.activeElement && document.activeElement !== document.body && !modal.contains(document.activeElement)) {
      modalOpener = document.activeElement;
    }
    overlay.hidden = false;
    document.documentElement.classList.add("has-modal-open");
    document.body.classList.add("has-modal-open");
    setBackgroundInert(true);
  }

  function focusFirstModalControl(name) {
    var panel = panels[name];
    if (!panel) return;
    var target = Array.prototype.filter.call(
      panel.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"),
      function (element) { return element.getClientRects().length > 0; }
    )[0];
    if (target) target.focus();
  }

  function hasUnsavedAuthInput() {
    var panelName = activePanelName === "doc" ? docReturnPanel : activePanelName;
    var panel = panels[panelName];
    var form = panel && panel.querySelector("form");
    if (!form) return false;
    return Array.prototype.some.call(form.querySelectorAll("input, select, textarea"), function (control) {
      if (control.disabled || control.type === "hidden") return false;
      if (control.closest(".auth-field[hidden], .auth-consent[hidden]")) return false;
      // Consent checkboxes are choices, not partially entered account data.
      // They should not block Back/Close behind a native confirmation prompt.
      if (control.type === "checkbox" || control.type === "radio") return false;
      return control.value.trim() !== "";
    });
  }

  function confirmDiscardAuthInput() {
    return !hasUnsavedAuthInput();
  }

  function hideDiscardPrompt(restoreFocus) {
    discardPrompt.hidden = true;
    pendingDiscardAction = null;
    var target = discardReturnFocus;
    discardReturnFocus = null;
    if (restoreFocus && target && target.isConnected && typeof target.focus === "function") {
      target.focus();
    }
  }

  function showDiscardPrompt(onDiscard) {
    pendingDiscardAction = onDiscard;
    discardReturnFocus = document.activeElement;
    discardPrompt.hidden = false;
    discardCancelButton.focus();
  }

  function requestDiscardAuthInput(onDiscard) {
    if (!hasUnsavedAuthInput()) {
      onDiscard();
      return;
    }
    showDiscardPrompt(onDiscard);
  }

  function discardFormAndContinue() {
    var action = pendingDiscardAction;
    hideDiscardPrompt(false);
    if (action) action();
  }

  discardCancelButton.addEventListener("click", function () {
    hideDiscardPrompt(true);
  });
  discardConfirmButton.addEventListener("click", discardFormAndContinue);

  function resetAuthPanelState(name) {
    var panel = panels[name];
    var form = panel && panel.querySelector("form");
    if (!form) return;

    form.reset();
    form.querySelectorAll("[data-invalid]").forEach(function (field) {
      setInvalid(field, false);
    });

    var status = form.querySelector(".auth-status");
    if (status) clearStatus(status);

    var button = form.querySelector(".auth-submit");
    if (button && button.dataset.state === "loading") setLoading(button, false);
  }

  function syncFromHash() {
    var panelName = HASH_TO_PANEL[window.location.hash];
    if (panelName) {
      if (activePanelName !== panelName) resetAuthPanelState(panelName);
      showPanel(panelName);
      openModalShell();
      focusFirstModalControl(panelName);
    } else if (!window.__promoModalPinnedOpen) {
      activePanelName = null;
      overlay.hidden = true;
      document.documentElement.classList.remove("has-modal-open");
      document.body.classList.remove("has-modal-open");
      setBackgroundInert(false);
    }
  }

  function closeModal() {
    if (!confirmDiscardAuthInput()) {
      showDiscardPrompt(closeModalWithoutConfirmation);
      return;
    }
    closeModalWithoutConfirmation();
  }

  function closeModalWithoutConfirmation() {
    hideDiscardPrompt(false);
    if (window.location.hash) {
      // `null` here, not "" — some tooling (Next's dev-mode HMR client, at
      // least) wraps history.pushState/replaceState and tries to tag the
      // state argument with a property of its own; that throws when state is
      // a primitive string instead of null/an object/undefined.
      history.pushState(null, document.title, window.location.pathname + window.location.search);
    }
    window.__promoModalPinnedOpen = false;
    activePanelName = null;
    overlay.hidden = true;
    document.documentElement.classList.remove("has-modal-open");
    document.body.classList.remove("has-modal-open");
    setBackgroundInert(false);

    var restoreTarget = modalOpener;
    modalOpener = null;
    if (restoreTarget && restoreTarget.isConnected && typeof restoreTarget.focus === "function") restoreTarget.focus();
  }

  window.addEventListener("hashchange", syncFromHash);
  syncFromHash();

  // ── Google sign-in ──────────────────────────────────────────────────────
  document.querySelectorAll(".auth-google").forEach(function (btn) {
    btn.addEventListener("click", function () {
      window.location.href = "/api/auth/google/start";
    });
  });

  // A failed Google round-trip lands back here as ?google_error=...#login.
  (function surfaceGoogleError() {
    var params = new URLSearchParams(window.location.search);
    var message = params.get("google_error");
    if (!message) return;
    var status = document.querySelector("[data-signin-status]");
    if (status) {
      status.textContent = message;
      status.className = "auth-status is-visible is-error";
    }
    params.delete("google_error");
    var query = params.toString();
    history.replaceState(
      null,
      document.title,
      window.location.pathname + (query ? "?" + query : "") + window.location.hash
    );
  })();

  document.querySelectorAll("[data-close-modal]").forEach(function (btn) {
    btn.addEventListener("click", closeModal);
  });

  document.querySelectorAll("[data-back-to-welcome]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      requestDiscardAuthInput(function () { window.location.hash = "join"; });
    });
  });

  document.querySelectorAll("[data-back-to-signin]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      requestDiscardAuthInput(function () {
        window.__promoModalPinnedOpen = false;
        window.location.hash = "login";
      });
    });
  });

  document.querySelectorAll(".auth-modal a[href^='#']").forEach(function (link) {
    link.addEventListener("click", function (event) {
      if (link.hasAttribute("data-open-doc")) return;
      if (!hasUnsavedAuthInput()) return;
      event.preventDefault();
      var destination = link.hash;
      requestDiscardAuthInput(function () { window.location.hash = destination; });
    });
  });

  // ── Terms / Privacy document panel ──────────────────────────────────────
  // Reading the docs is optional — a checkbox can always just be checked
  // directly. This only exists for people who click the link: it shows the
  // real text and, on "I agree", checks that one box for them and goes back.
  // Using data-open-doc + preventDefault (instead of leaving these as plain
  // "#terms"/"#privacy" links) is the fix for the modal-closing bug: an
  // unhandled hash change that isn't in HASH_TO_PANEL falls through to
  // syncFromHash()'s "no matching panel" branch, which closes the whole modal.
  var docReturnPanel = "signup";
  // The panels share one scroll container. Remember where the reader was in the
  // form so "I agree" / "Back" land them on the same consent row, not the top.
  var modalBody = document.querySelector(".auth-modal-body");
  var docReturnScroll = 0;

  function returnFromDoc(checkbox) {
    showPanel(docReturnPanel);
    if (modalBody) modalBody.scrollTop = docReturnScroll;
    if (!checkbox) return;
    checkbox.focus({ preventScroll: true });
    var row = checkbox.closest(".auth-consent");
    if (row) {
      row.classList.remove("is-invalid", "is-flash");
      void row.offsetWidth; // restart the highlight if it is already running
      row.classList.add("is-flash");
    }
  }

  // Delegate these controls from the modal shell so they continue working if
  // the app hydrates or replaces the consent markup after this script loads.
  modal.addEventListener("click", function (event) {
    var target = event.target;
    if (!target || typeof target.closest !== "function") return;

    var link = target.closest("[data-open-doc]");
    if (link && modal.contains(link)) {
      event.preventDefault();
      var docName = link.getAttribute("data-open-doc");
      var parentPanel = link.closest(".auth-panel");
      if (parentPanel && parentPanel.id) {
        docReturnPanel = parentPanel.id.replace("panel-", "");
      }
      docReturnScroll = modalBody ? modalBody.scrollTop : 0;
      panels.doc.querySelectorAll("[data-doc]").forEach(function (block) {
        block.hidden = block.getAttribute("data-doc") !== docName;
      });
      showPanel("doc");
      if (modalBody) modalBody.scrollTop = 0;
      return;
    }

    var backButton = target.closest("[data-doc-back]");
    if (backButton && modal.contains(backButton)) {
      returnFromDoc(null);
      return;
    }

    var acceptButton = target.closest("[data-doc-accept]");
    if (!acceptButton || !modal.contains(acceptButton)) return;
    var acceptedDoc = acceptButton.getAttribute("data-doc-accept");
    var checkbox = document.querySelector('[data-consent="' + acceptedDoc + '"]');
    if (checkbox) checkbox.checked = true;
    returnFromDoc(checkbox);
  });

  var backdropPointerStart = null;
  overlay.addEventListener("pointerdown", function (event) {
    backdropPointerStart = event.target === overlay
      ? { x: event.clientX, y: event.clientY }
      : null;
  });

  overlay.addEventListener("pointerup", function (event) {
    var start = backdropPointerStart;
    backdropPointerStart = null;
    if (!start || event.target !== overlay) return;
    var distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (distance <= 8) closeModal();
  });

  overlay.addEventListener("pointercancel", function () {
    backdropPointerStart = null;
  });

  document.addEventListener("keydown", function (event) {
    if (overlay.hidden) return;
    if (event.key === "Escape") {
      if (!discardPrompt.hidden) {
        event.preventDefault();
        hideDiscardPrompt(true);
        return;
      }
      closeModal();
      return;
    }
    if (event.key !== "Tab") return;

    var focusable = getFocusableElements();
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (!modal.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
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
    var control = field.querySelector("input, select, textarea");
    var error = field.querySelector(".auth-field-error");
    if (control) {
      control.setAttribute("aria-invalid", invalid ? "true" : "false");
      if (error) {
        if (!error.id) error.id = (control.id || field.dataset.field || "auth-field") + "-error";
        control.setAttribute("aria-describedby", error.id);
      }
    }
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
    if (!button) return;
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
    if (button && button.dataset.state === "loading") return;
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
  var categorySelect = document.getElementById("signup-category");
  var providerConsent = signupForm.querySelector("[data-provider-only]");
  var roleOptions = document.querySelectorAll("[data-role-option]");
  var currentRole = "homeowner";

  var CATEGORY_IDS = { Plumbing: 1, Cleaning: 2, Handyman: 3, Manicure: 4, Pedicure: 5 };

  function updateRoleFields() {
    var isProvider = currentRole === "provider";
    if (categoryField) categoryField.hidden = !isProvider;
    if (providerConsent) providerConsent.hidden = !isProvider;
    if (categorySelect) categorySelect.required = isProvider;
    if (categoryField && !categoryField.querySelector(".auth-field-error")) {
      var categoryError = document.createElement("p");
      categoryError.className = "auth-field-error";
      categoryError.textContent = "Please select a skill category.";
      categoryField.appendChild(categoryError);
    }
    var providerConsentInput = providerConsent && providerConsent.querySelector("input");
    if (providerConsentInput) providerConsentInput.required = isProvider;
  }

  roleOptions.forEach(function (btn) {
    btn.addEventListener("click", function () {
      roleOptions.forEach(function (b) {
        b.classList.toggle("is-active", b === btn);
        b.setAttribute("aria-selected", String(b === btn));
        b.setAttribute("tabindex", b === btn ? "0" : "-1");
      });
      currentRole = btn.getAttribute("data-role-option");
      updateRoleFields();
    });
    btn.addEventListener("keydown", function (event) {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      var index = Array.prototype.indexOf.call(roleOptions, btn);
      var nextIndex = event.key === "Home" ? 0 : event.key === "End" ? roleOptions.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + roleOptions.length) % roleOptions.length;
      roleOptions[nextIndex].focus();
      roleOptions[nextIndex].click();
    });
  });
  roleOptions.forEach(function (btn, index) {
    btn.setAttribute("tabindex", index === 0 ? "0" : "-1");
  });
  updateRoleFields();

  // ── Email confirmation panel (shown when register() returns session: null) ──
  var confirmPanel = panels.confirm;
  var confirmEmailInput = document.getElementById("confirm-email");
  var confirmCodeInput = document.getElementById("confirm-code");
  var confirmStatus = document.querySelector("[data-confirm-status]");
  var confirmForm = document.getElementById("confirm-form");
  var confirmResendButton = null;

  if (confirmForm) {
    confirmResendButton = document.createElement("button");
    confirmResendButton.type = "button";
    confirmResendButton.className = "auth-resend";
    confirmResendButton.textContent = "Resend code";
    confirmForm.appendChild(confirmResendButton);
    confirmResendButton.addEventListener("click", function () {
      if (confirmResendButton.disabled) return;
      confirmResendButton.disabled = true;
      confirmResendButton.textContent = "Sending…";
      postJson("/api/auth/send-email-otp", { email: confirmEmailInput.value })
        .then(function () {
          confirmCodeInput.value = "";
          showStatus(confirmStatus, "A new confirmation code was sent. Check your email.", false);
          confirmResendButton.textContent = "Code sent";
          window.setTimeout(function () {
            confirmResendButton.disabled = false;
            confirmResendButton.textContent = "Resend code";
          }, 1500);
          confirmCodeInput.focus();
        })
        .catch(function (err) {
          confirmResendButton.disabled = false;
          confirmResendButton.textContent = "Resend code";
          showStatus(confirmStatus, err.message, true);
        });
    });
  }

  function openConfirmPanel(email) {
    resetAuthPanelState("confirm");
    if (confirmEmailInput) confirmEmailInput.value = email;
    var emailLabel = confirmPanel && confirmPanel.querySelector("[data-confirm-email-label]");
    if (emailLabel) emailLabel.textContent = email;
    window.__promoModalPinnedOpen = true;
    showPanel("confirm");
    openModalShell();
    if (confirmResendButton) {
      confirmResendButton.disabled = false;
      confirmResendButton.textContent = "Resend code";
    }
    if (confirmCodeInput) confirmCodeInput.focus();
  }

  if (confirmForm) {
    confirmForm.addEventListener("submit", function (event) {
      event.preventDefault();
      clearStatus(confirmStatus);
      var button = confirmForm.querySelector(".auth-submit");
      if (button && button.dataset.state === "loading") return;
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

  signupForm.addEventListener("change", function (event) {
    var row = event.target.closest && event.target.closest(".auth-consent");
    if (row && event.target.checked) row.classList.remove("is-invalid");
  });

  signupForm.addEventListener("submit", function (event) {
    event.preventDefault();
    clearStatus(signupStatus);

    var nameInput = document.getElementById("signup-name");
    var emailInput = document.getElementById("signup-email");
    var passwordInput = document.getElementById("signup-password");
    var confirmInput = document.getElementById("signup-confirm");

    var nameField = signupForm.querySelector('[data-field="name"]');
    var emailField = signupForm.querySelector('[data-field="email"]');
    var passwordField = signupForm.querySelector('[data-field="password"]');
    var confirmField = signupForm.querySelector('[data-field="confirm"]');

    nameInput.value = nameInput.value.trim();
    emailInput.value = emailInput.value.trim();
    var isProvider = currentRole === "provider";
    var nameValid = nameInput.checkValidity();
    var emailValid = emailInput.checkValidity();
    var passwordValid = passwordInput.checkValidity();
    var confirmValid = confirmInput.value === passwordInput.value && confirmInput.value.length > 0;
    var categoryValid = !isProvider || (categorySelect && categorySelect.checkValidity());
    var consentsValid = Array.prototype.every.call(
      signupForm.querySelectorAll(".auth-consent:not([hidden]) input[required]"),
      function (checkbox) { return checkbox.checked; }
    );

    setInvalid(nameField, !nameValid);
    setInvalid(emailField, !emailValid);
    setInvalid(passwordField, !passwordValid);
    setInvalid(confirmField, !confirmValid);
    setInvalid(categoryField, isProvider && !categoryValid);
    Array.prototype.forEach.call(signupForm.querySelectorAll(".auth-consent"), function (row) {
      var box = row.querySelector("input[required]");
      row.classList.toggle("is-invalid", !row.hidden && !!box && !box.checked);
    });

    var fieldsValid = nameValid && emailValid && passwordValid && confirmValid && categoryValid;
    if (!fieldsValid || !consentsValid) {
      showStatus(
        signupStatus,
        !fieldsValid && !consentsValid
          ? "Fill in the highlighted fields and accept the required consents."
          : !fieldsValid
            ? "Check the highlighted fields above."
            : "Please accept the required consents to continue.",
        true
      );
      // The status line sits under the button, often below the fold: take the
      // reader to the first thing that needs fixing instead.
      var firstProblem = signupForm.querySelector(
        '.auth-field:not([hidden])[data-invalid="true"] input, .auth-field:not([hidden])[data-invalid="true"] select, .auth-consent.is-invalid input'
      );
      if (firstProblem) {
        firstProblem.scrollIntoView({ block: "center", behavior: "smooth" });
        firstProblem.focus({ preventScroll: true });
      }
      return;
    }

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
    if (button && button.dataset.state === "loading") return;
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

  // ── Forgot / Reset password ─────────────────────────────────────────────
  var forgotForm = document.getElementById("forgot-form");
  var forgotStatus = document.querySelector("[data-forgot-status]");
  var resetPanel = panels.reset;
  var resetEmailInput = document.getElementById("reset-email");
  var resetCodeInput = document.getElementById("reset-code");
  var resetPasswordInput = document.getElementById("reset-password");
  var resetStatus = document.querySelector("[data-reset-status]");
  var resetForm = document.getElementById("reset-form");

  document.querySelectorAll('input[type="email"], #confirm-code, #reset-code').forEach(function (input) {
    input.setAttribute("spellcheck", "false");
  });
  [confirmCodeInput, document.getElementById("reset-code")].forEach(function (input) {
    if (!input) return;
    input.setAttribute("pattern", "[0-9]{6}");
    input.setAttribute("maxlength", "6");
    input.setAttribute("inputmode", "numeric");
  });

  function openResetPanel(email) {
    resetAuthPanelState("reset");
    if (resetEmailInput) resetEmailInput.value = email;
    var emailLabel = resetPanel && resetPanel.querySelector("[data-reset-email-label]");
    if (emailLabel) emailLabel.textContent = email;
    window.__promoModalPinnedOpen = true;
    showPanel("reset");
    overlay.hidden = false;
    document.documentElement.classList.add("has-modal-open");
    document.body.classList.add("has-modal-open");
    if (resetCodeInput) resetCodeInput.focus();
  }

  if (forgotForm) {
    forgotForm.addEventListener("submit", function (event) {
      event.preventDefault();
      clearStatus(forgotStatus);

      var emailInput = document.getElementById("forgot-email");
      var emailField = forgotForm.querySelector('[data-field="email"]');
      var emailValid = emailInput.checkValidity();
      setInvalid(emailField, !emailValid);

      if (!emailValid) {
        showStatus(forgotStatus, "Please enter a valid email address.", true);
        return;
      }

      var button = forgotForm.querySelector(".auth-submit");
      if (button && button.dataset.state === "loading") return;
      setLoading(button, true);
      postJson("/api/auth/forgot-password", { email: emailInput.value })
        .then(function () {
          setLoading(button, false);
          openResetPanel(emailInput.value);
        })
        .catch(function (err) {
          setLoading(button, false);
          showStatus(forgotStatus, err.message, true);
        });
    });
  }

  if (resetForm) {
    resetForm.addEventListener("submit", function (event) {
      event.preventDefault();
      clearStatus(resetStatus);

      var codeField = resetForm.querySelector('[data-field="code"]');
      var passwordField = resetForm.querySelector('[data-field="password"]');
      var codeValid = resetCodeInput.checkValidity();
      var passwordValid = resetPasswordInput.checkValidity();
      setInvalid(codeField, !codeValid);
      setInvalid(passwordField, !passwordValid);

      if (!codeValid || !passwordValid) {
        showStatus(resetStatus, "Check the highlighted fields above.", true);
        return;
      }

      var button = resetForm.querySelector(".auth-submit");
      if (button && button.dataset.state === "loading") return;
      setLoading(button, true);
      postJson("/api/auth/reset-password", {
        email: resetEmailInput.value,
        token: resetCodeInput.value,
        new_password: resetPasswordInput.value,
      })
        .then(function () {
          setLoading(button, false);
          showStatus(resetStatus, "Password reset successfully. Redirecting…", false);
          window.__promoModalPinnedOpen = false;
          window.setTimeout(function () {
            window.location.href = "/account";
          }, 800);
        })
        .catch(function (err) {
          setLoading(button, false);
          showStatus(resetStatus, err.message, true);
        });
    });
  }
})();
