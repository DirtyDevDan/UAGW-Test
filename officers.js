const officerStage = document.querySelector(".officer-stage");
const officerFigures = [...document.querySelectorAll(".officer-figure")];

if (officerStage && officerFigures.length) {
  const closeBiography = (figure) => {
    const biography = document.getElementById(figure.getAttribute("aria-controls"));
    figure.classList.remove("is-active");
    figure.setAttribute("aria-expanded", "false");
    figure.setAttribute("aria-label", figure.getAttribute("aria-label").replace("Close biography.", "Open biography."));
    if (biography) biography.hidden = true;
  };

  const openBiography = (figure) => {
    officerFigures.forEach((candidate) => {
      if (candidate !== figure) closeBiography(candidate);
    });
    const biography = document.getElementById(figure.getAttribute("aria-controls"));
    figure.classList.add("is-active");
    figure.setAttribute("aria-expanded", "true");
    figure.setAttribute("aria-label", figure.getAttribute("aria-label").replace("Open biography.", "Close biography."));
    if (biography) biography.hidden = false;
    officerStage.classList.add("has-active");
  };

  officerFigures.forEach((figure) => {
    figure.addEventListener("click", () => {
      if (figure.classList.contains("is-active")) {
        closeBiography(figure);
        officerStage.classList.remove("has-active");
      } else {
        openBiography(figure);
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const activeFigure = officerStage.querySelector(".officer-figure.is-active");
    if (!activeFigure) return;
    closeBiography(activeFigure);
    officerStage.classList.remove("has-active");
    activeFigure.focus();
  });
}
