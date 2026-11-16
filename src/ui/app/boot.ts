// Router: picks the page from location.hash. Main thread only.
// "#spike" runs the unchanged spike page, "#bench" the speed page, every other hash the app.
// Page modules load only through dynamic imports, so each route loads only its own code and CSS.

const hash = location.hash;

window.addEventListener("hashchange", () => {
  location.reload();
});

function rootElement(): HTMLElement {
  const root = document.getElementById("app");
  if (root === null) throw new Error('Missing required DOM element with id: "app"');
  return root;
}

if (hash === "#spike") {
  // The spike page sets itself up in a window DOMContentLoaded listener. This module runs
  // before that event, so wait for it, load the spike, then replay the event once for it.
  window.addEventListener(
    "DOMContentLoaded",
    () => {
      void import("../main").then(() => {
        window.dispatchEvent(new Event("DOMContentLoaded"));
      });
    },
    { once: true },
  );
} else {
  void import("./page-entry").then((m) => {
    const root = rootElement();
    if (hash === "#bench") m.mountSpeedPage(root);
    else m.mountApp(root);
  });
}