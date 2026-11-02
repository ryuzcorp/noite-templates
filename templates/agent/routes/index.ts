import { defineHandler } from "void";

import { humanPage } from "../src/page";

/** GET / — the human page. No auth (static, no secrets). */
export const GET = defineHandler((c) => c.html(humanPage()));
