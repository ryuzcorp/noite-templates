import { atom, watch } from "ilha";

export default function Counter({ start = 0 }: { start?: number }) {
  const count = atom(start);
  // The island ships as static HTML and its handler attaches only when the
  // island's JavaScript loads: a click before that is lost. The button
  // stays disabled until then.
  const mounted = atom(false);
  watch.once(() => {
    if (typeof window === "undefined") {
      return;
    }
    mounted.set(true);
  });
  return (
    <button
      type="button"
      disabled={!mounted()}
      onclick={() => count.update((n) => n + 1)}
      class="w-fit rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
    >
      Clicked {count} times
    </button>
  );
}
