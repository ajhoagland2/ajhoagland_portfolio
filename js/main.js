const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");

if (navLinks && !navLinks.querySelector("a[href='workflow.html']")) {
    const projectsLink = navLinks.querySelector("a[href='projects.html']");
    const workflowItem = document.createElement("li");
    const workflowLink = document.createElement("a");

    workflowLink.href = "workflow.html";
    workflowLink.textContent = "Workflow";

    if (window.location.pathname.endsWith("workflow.html")) {
        workflowLink.setAttribute("aria-current", "page");
    }

    workflowItem.appendChild(workflowLink);

    if (projectsLink && projectsLink.parentElement) {
        projectsLink.parentElement.insertAdjacentElement("afterend", workflowItem);
    } else {
        navLinks.prepend(workflowItem);
    }
}

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

const timelineTrack = document.querySelector("[data-timeline-track]");

if (timelineTrack) {
    const scrollTimeline = (direction) => {
        const distance = Math.min(timelineTrack.clientWidth * 0.82, 720);

        timelineTrack.scrollBy({
            left: direction * distance,
            behavior: "smooth"
        });
    };

    document.querySelectorAll("[data-timeline-scroll]").forEach((button) => {
        button.addEventListener("click", () => {
            scrollTimeline(button.dataset.timelineScroll === "prev" ? -1 : 1);
        });
    });

    timelineTrack.addEventListener("wheel", (event) => {
        const canScrollSideways = timelineTrack.scrollWidth > timelineTrack.clientWidth;

        if (!canScrollSideways || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
            return;
        }

        event.preventDefault();
        timelineTrack.scrollBy({
            left: event.deltaY,
            behavior: "smooth"
        });
    }, { passive: false });
}

const contactForm = document.querySelector("#contact-form");
const formStatus = document.querySelector("#form-status");

if (contactForm && formStatus) {
    contactForm.addEventListener("submit", (event) => {
        const formData = new FormData(contactForm);
        const name = String(formData.get("name") || "").trim();
        const email = String(formData.get("email") || "").trim();
        const message = String(formData.get("message") || "").trim();

        if (!name || !email || !message) {
            event.preventDefault();
            formStatus.textContent = "Please complete every field before sending.";
            return;
        }

        formStatus.textContent = "Sending your message...";
    });
}

document.querySelectorAll("video[data-lock-playback='true']").forEach((video) => {
    const keepPlaying = () => {
        if (video.paused) {
            video.play().catch(() => {});
        }
    };

    video.addEventListener("pause", keepPlaying);
    video.addEventListener("ended", keepPlaying);
    keepPlaying();
});
