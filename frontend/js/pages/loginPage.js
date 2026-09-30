import { api } from "../api/client.js";

export function renderLoginPage(container, { onSignedIn }) {
  container.innerHTML = `
    <div class="auth-page">
      <section class="auth-brand-panel">
        <div class="auth-brand">RSG</div>
        <div class="auth-brand-copy">
          <h1>Team balance dashboard</h1>
          <p>Track API balances, usage history, and corrections from one shared dashboard.</p>
        </div>
        <div>API keys balances</div>
      </section>
      <section class="auth-form-wrap">
        <div class="auth-card card">
          <h2>Sign in</h2>
          <p class="intro">Use your RSG team account.</p>
          <form class="auth-form" data-login-form>
            <div class="field">
              <label for="username">Username</label>
              <input class="input" id="username" name="username" autocomplete="username" required />
            </div>
            <div class="field">
              <label for="password">Password</label>
              <input class="input" id="password" name="password" type="password" autocomplete="current-password" required />
            </div>
            <div class="error-text" data-error></div>
            <button class="btn btn-primary" type="submit" data-submit>Sign in</button>
          </form>
          <p class="auth-switch">Need an account? <a href="#/register">Register</a></p>
        </div>
      </section>
    </div>
  `;

  const form = container.querySelector("[data-login-form]");
  const errorEl = container.querySelector("[data-error]");
  const submit = container.querySelector("[data-submit]");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.textContent = "";
    submit.disabled = true;
    try {
      const body = Object.fromEntries(new FormData(form).entries());
      const result = await api.login(body);
      onSignedIn(result.user);
    } catch (error) {
      errorEl.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });
}
