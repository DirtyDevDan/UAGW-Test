(function () {
  const form = document.getElementById("admin-bootstrap-form");
  const message = document.getElementById("admin-setup-message");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = document.getElementById("admin-password").value;
    if (password !== document.getElementById("admin-password-confirm").value) { message.textContent = "Passwords do not match."; message.classList.add("error"); return; }
    const button = form.querySelector("button[type='submit']"); button.disabled = true; message.classList.remove("error"); message.textContent = "Creating Guild Master…";
    const result = await window.uaGuildApi.request("/api/auth/bootstrap", { method: "POST", body: JSON.stringify({
      setupKey: document.getElementById("admin-setup-key").value,
      displayName: document.getElementById("admin-display-name").value.trim(),
      discordName: document.getElementById("admin-discord-name").value.trim(),
      email: document.getElementById("admin-email").value.trim(), password
    }) });
    button.disabled = false;
    if (result.error) { message.textContent = result.error.message; message.classList.add("error"); return; }
    window.uaGuildApi.writeSession(result.data.session); message.textContent = "Guild Master created. Opening Officer Command…";
    window.setTimeout(() => { window.location.href = "guild-admin.html"; }, 600);
  });
})();
