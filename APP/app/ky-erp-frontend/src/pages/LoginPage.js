import React, { useLayoutEffect } from "react";
import LoginPageOriginal from "./LoginPage.jsx";

const AUTHENTICATOR_FALLBACK_DELAY_MS = 20000;

export default function LoginPageImmediateFallback() {
  useLayoutEffect(() => {
    const originalSetTimeout = window.setTimeout;

    // LoginPage.jsx telefon onayını birincil yöntem olarak tutar; yalnızca
    // Authenticator yedeğinin 20 saniyelik UI gecikmesini kaldırıyoruz.
    const immediateLoginTimeout = (callback, delay, ...args) => {
      const effectiveDelay = Number(delay) === AUTHENTICATOR_FALLBACK_DELAY_MS ? 0 : delay;
      return originalSetTimeout.call(window, callback, effectiveDelay, ...args);
    };
    window.setTimeout = immediateLoginTimeout;

    const openAuthenticatorFallback = () => {
      const details = document.querySelector("details.auth-fallback-details.auth-fallback-late");
      if (details && !details.open) details.open = true;
    };

    openAuthenticatorFallback();
    const observer = new MutationObserver(openAuthenticatorFallback);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (window.setTimeout === immediateLoginTimeout) window.setTimeout = originalSetTimeout;
    };
  }, []);

  return React.createElement(LoginPageOriginal);
}
