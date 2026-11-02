import { boolean, defineEnv, oneOf, string, url } from 'void/env';

export default defineEnv({
  // RELAXED VARIANT (conformance probe only): defaults let the app boot on
  // Noite without slice 1 (settings -> worker vars). The faithful fixture
  // (conformance-ks-full) keeps these required.
  APP_NAME: string().default('Kitchen Sink'),
  SECRET_KEY: string().default('relaxed-default-token'),
  FEATURE_FLAG: boolean().default(false),
  API_URL: url().default('https://api.example.com'),
  LOG_LEVEL: oneOf(['debug', 'info', 'warn', 'error']).default('info'),
  VITE_APP_TITLE: string().default('Kitchen Sink'),
});
