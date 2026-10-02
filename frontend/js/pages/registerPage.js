import { api } from "../api/client.js";
import { themeToggleHtml } from "../components/themeToggle.js";

export async function renderRegisterPage(container, { onSignedIn }) {
  let registrationCodeRequired = false;
  try {
    const config = await api.getRegistrationConfig();
    registrationCodeRequired = Boolean(config.registration_code_required);
  } catch (_) {
    // The registration form still works; the server will validate the request.
  }

  container.innerHTML = `
    <div class="auth-page">
      ${themeToggleHtml("theme-toggle-auth")}
      <section class="auth-brand-panel">
        <div class="auth-brand">BD</div>
        <div class="auth-brand-copy">
          <h1>Create a team account</h1>
          <p>Each team member gets a separate login while sharing the same balance history database.</p>
        </div>
        <div>API keys balances</div>
      </section>
      <section class="auth-form-wrap">
        <div class="auth-card card">
          <h2>Register</h2>
          <p class="intro">Create your BD dashboard account.</p>
          <form class="auth-form" data-register-form>
            <div class="field">
              <label for="username">Username</label>
              <input class="input" id="username" name="username" autocomplete="username" minlength="3" maxlength="32" required />
              <div class="help">Letters, numbers, dot, underscore, and hyphen.</div>
            </div>
            <div class="field">
              <label for="password">Password</label>
              <input class="input" id="password" name="password" type="password" autocomplete="new-password" minlength="8" required />
            </div>
            <div class="field">
              <label for="confirmPassword">Confirm password</label>
              <input class="input" id="confirmPassword" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required />
            </div>
            <div class="field">
              <label for="registrationCode">Team registration code ${registrationCodeRequired ? "" : "(optional)"}</label>
              <input class="input" id="registrationCode" name="registrationCode" type="password" ${registrationCodeRequired ? "required" : ""} />
              <div class="help">${registrationCodeRequired ? "Ask the dashboard owner for this code." : "The server does not currently require a registration code."}</div>
            </div>
            <div class="error-text" data-error></div>
            <button class="btn btn-primary" type="submit" data-submit>Create account</button>
          </form>
          <p class="auth-switch">Already registered? <a href="#/login">Sign in</a></p>
        </div>
      </section>
    </div>
  `;

  const form = container.querySelector("[data-register-form]");
  const errorEl = container.querySelector("[data-error]");
  const submit = container.querySelector("[data-submit]");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.textContent = "";
    const data = Object.fromEntries(new FormData(form).entries());
    if (data.password !== data.confirmPassword) {
      errorEl.textContent = "Passwords do not match.";
      return;
    }

    submit.disabled = true;
    try {
      const result = await api.register({
        username: data.username,
        password: data.password,
        registration_code: data.registrationCode || null,
      });
      onSignedIn(result.user);
    } catch (error) {
      errorEl.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });
}
