import { defineEnv, string } from 'void/env';

export default defineEnv({
  PROBE: string().default('1'),
});
