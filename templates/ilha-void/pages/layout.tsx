import { Link } from "@ilha/void";
import type { View } from "ilha";

import "./app.css";

export default function Layout({ children }: { children?: View }) {
  return (
    <div class="min-h-screen">
      <div class="mx-auto max-w-xl px-6 py-8">
        <nav class="mb-8 flex gap-4 text-sm font-medium text-gray-600 dark:text-gray-400">
          <Link href="/" prefetch>
            Todos
          </Link>
          <Link href="/about" prefetch>
            About
          </Link>
        </nav>
        <main>{children}</main>
      </div>
    </div>
  );
}
