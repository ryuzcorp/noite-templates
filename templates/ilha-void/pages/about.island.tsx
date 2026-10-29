import Counter from "./_counter" with { island: "load" };

export default function About() {
  return (
    <section class="flex flex-col gap-4">
      <h1 class="text-2xl font-semibold">About</h1>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        This page is an island page: Void sends static HTML, and only the
        counter below ships JavaScript.
      </p>
      <Counter start={1} />
    </section>
  );
}
