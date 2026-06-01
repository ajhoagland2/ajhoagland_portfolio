const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");

if (navToggle && navLinks) {
    navToggle.addEventListener("click", () => {
        const isOpen = navToggle.getAttribute("aria-expanded") === "true";

        navToggle.setAttribute("aria-expanded", String(!isOpen));
        navToggle.classList.toggle("is-open", !isOpen);
        navLinks.classList.toggle("is-open", !isOpen);
    });

    navLinks.addEventListener("click", (event) => {
        if (event.target.matches("a")) {
            navToggle.setAttribute("aria-expanded", "false");
            navToggle.classList.remove("is-open");
            navLinks.classList.remove("is-open");
        }
    });
}

const faders = document.querySelectorAll(".fade");

if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("visible");
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.2
    });

    faders.forEach((element) => observer.observe(element));
} else {
    faders.forEach((element) => element.classList.add("visible"));
}

const contactForm = document.querySelector("#contact-form");
const formStatus = document.querySelector("#form-status");

if (contactForm && formStatus) {
    contactForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const formData = new FormData(contactForm);
        const name = String(formData.get("name") || "").trim();
        const email = String(formData.get("email") || "").trim();
        const message = String(formData.get("message") || "").trim();

        if (!name || !email || !message) {
            formStatus.textContent = "Please complete every field before sending.";
            return;
        }

        formStatus.textContent = "Message queued. Replace this demo handler with your preferred form service.";
        contactForm.reset();
    });
}
