document.querySelectorAll("[data-answer]").forEach((button) => {
  button.addEventListener("click", () => {
    const feedback = document.querySelector("#feedback");
    const correct = button.dataset.answer === "correct";
    feedback.textContent = correct
      ? button.dataset.correctMessage ??
        "Right: the route table maps the URL pattern to the route module."
      : button.dataset.wrongMessage ??
        "Not quite. Check app/routes.ts: it declares URL patterns and points each one at a route module.";
    feedback.setAttribute("role", "status");
  });
});
