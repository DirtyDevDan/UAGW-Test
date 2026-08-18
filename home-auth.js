(() => {
  const corner = document.getElementById("home-login-corner");
  const card = document.getElementById("home-login-card");
  if (!corner || !card) return;

  const config = window.UNITED_AZEROTH_SUPABASE || {};
  const openButton = document.getElementById("home-login-open");
  const closeButton = document.getElementById("home-login-close");
  const back = document.getElementById("home-login-back");
  const setMessage = (id, message, error = false) => {
    const element = document.getElementById(id);
    element.textContent = message;
    element.classList.toggle("error", error);
  };

  const setOpen = (open) => {
    card.classList.toggle("is-flipped", open);
    openButton.setAttribute("aria-expanded", String(open));
    back.setAttribute("aria-hidden", String(!open));
    if (open) window.setTimeout(() => document.getElementById("home-signin-email").focus(), 380);
    else if (!corner.hidden) openButton.focus();
  };

  const updateVisibility = (signedIn = document.body.classList.contains("ua-authenticated")) => {
    corner.hidden = signedIn;
    if (signedIn) setOpen(false);
  };

  updateVisibility();
  window.addEventListener("ua-auth-ui", (event) => updateVisibility(event.detail.signedIn));
  openButton.addEventListener("click", () => setOpen(true));
  closeButton.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && card.classList.contains("is-flipped")) setOpen(false);
  });

  document.querySelectorAll("#home-login-back .auth-tabs [role='tab']").forEach((tab) => tab.addEventListener("click", () => {
    document.querySelectorAll("#home-login-back .auth-tabs [role='tab']").forEach((item) => item.setAttribute("aria-selected", String(item === tab)));
    document.getElementById("home-signin-form").hidden = tab.getAttribute("aria-controls") !== "home-signin-form";
    document.getElementById("home-signup-form").hidden = tab.getAttribute("aria-controls") !== "home-signup-form";
    card.classList.toggle("showing-signup", tab.getAttribute("aria-controls") === "home-signup-form");
  }));

  const params = new URLSearchParams(window.location.search);
  if (params.get("login") === "1") window.setTimeout(() => setOpen(true), 80);
  if (params.get("access") === "officer") {
    document.querySelector(".home-login-kicker").textContent = "Officer access";
    openButton.firstChild.textContent = "Officer login ";
  }

  if (!config.url || !config.publishableKey || !window.supabase?.createClient) {
    openButton.disabled = true;
    openButton.firstChild.textContent = "Login unavailable ";
    return;
  }

  const client = window.uaSupabaseClient || window.supabase.createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.uaSupabaseClient = client;

  document.getElementById("home-signin-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("home-signin-message", "Signing in…");
    const { error } = await client.auth.signInWithPassword({
      email: document.getElementById("home-signin-email").value.trim(),
      password: document.getElementById("home-signin-password").value
    });
    if (error) {
      setMessage("home-signin-message", error.message, true);
      return;
    }
    setMessage("home-signin-message", "Signed in. Your dashboard is ready.");
    await window.uaAuthNavigation?.refresh();
  });

  document.getElementById("home-signup-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = document.getElementById("home-signup-password").value;
    if (password !== document.getElementById("home-signup-confirm").value) {
      setMessage("home-signup-message", "Passwords do not match.", true);
      return;
    }
    setMessage("home-signup-message", "Creating your account…");
    const { data, error } = await client.auth.signUp({
      email: document.getElementById("home-signup-email").value.trim(),
      password,
      options: { data: { display_name: document.getElementById("home-signup-display-name").value.trim() } }
    });
    if (error) {
      setMessage("home-signup-message", error.message, true);
      return;
    }
    if (!data.session) {
      setMessage("home-signup-message", "Check your email to confirm your account, then sign in.");
      return;
    }
    setMessage("home-signup-message", "Account created. Your dashboard is ready.");
    await window.uaAuthNavigation?.refresh();
  });

  document.getElementById("home-reset-password").addEventListener("click", async () => {
    const email = document.getElementById("home-signin-email").value.trim();
    if (!email) {
      setMessage("home-signin-message", "Enter your email address first.", true);
      return;
    }
    const redirectTo = new URL("index.html?login=1", window.location.href).href;
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
    setMessage("home-signin-message", error ? error.message : "Password reset email sent.", Boolean(error));
  });
})();
