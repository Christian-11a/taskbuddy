(function () {
  "use strict";

  var story = document.querySelector(".story");
  var carousel = document.querySelector("[data-carousel]");
  var image = document.querySelector("[data-story-image]");
  var caption = document.querySelector("[data-story-caption]");
  var number = document.querySelector("[data-story-number]");
  var roleLabel = document.querySelector("[data-story-role]");
  var title = document.querySelector("[data-story-title]");
  var body = document.querySelector("[data-story-body]");
  var points = document.querySelector("[data-story-points]");
  var storyCopy = document.querySelector(".story-copy");
  var progress = document.querySelector("[data-story-progress]");
  var status = document.querySelector("[data-story-status]");
  var storyKicker = document.querySelector("[data-story-kicker]");
  var storyHeading = document.querySelector("[data-story-heading]");
  var storyLede = document.querySelector("[data-story-lede]");
  var storyHeadingCopy = document.querySelector(".story-heading__copy");
  var storyCapture = document.querySelector(".story-capture");
  var roleControls = document.querySelectorAll("[data-role-target]");
  var heroVideo = document.querySelector("[data-hero-video]");
  var heroPlay = document.querySelector("[data-hero-play]");
  var heroRoleLabel = document.querySelector("[data-hero-role-label]");
  var heroCaption = document.querySelector("[data-hero-caption]");
  var motionOverride = new URLSearchParams(window.location.search).get("motion");
  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  function isMotionReduced() {
    return motionOverride === "off";
  }
  function isCarouselMotionReduced() {
    return motionOverride === "off" || (motionOverride !== "on" && prefersReducedMotion.matches);
  }
  if (motionOverride === "on") document.documentElement.classList.add("motion-override-on");
  if (motionOverride === "off") document.documentElement.classList.add("motion-override-off");

  var stories = {
    customer: {
      kicker: "For homeowners",
      role: "Homeowner",
      heading: "Find the right person for the job.",
      lede: "Describe what you need, compare service providers, and choose with confidence.",
      steps: [
        {
          image: "../showcase-assets/customer/01-home-clean.png",
          alt: "TaskBuddy homeowner home screen with service search and active jobs",
          caption: "Start with what you need.",
          title: "Start with what you need.",
          body: "Find a service, check your active jobs, and take the next step.",
          points: ["See your active jobs", "Know what to do next", "Move at your own pace"]
        },
        {
          image: "../showcase-assets/customer/02-post-task-clean.png",
          alt: "TaskBuddy homeowner screen for posting a task with details",
          caption: "Tell service providers what you need.",
          title: "Tell service providers what you need.",
          body: "Add the service, location, schedule, and details in one request.",
          points: ["Describe the task clearly", "Choose a schedule", "Edit the request later"]
        },
        {
          image: "../showcase-assets/customer/03-provider-profile-clean.png",
          alt: "TaskBuddy homeowner view of a service provider profile",
          caption: "Choose the right service provider.",
          title: "Choose the right service provider.",
          body: "Check a service provider’s profile and past work before you choose.",
          points: ["See their experience", "Compare your options", "Choose with confidence"]
        },
        {
          image: "../showcase-assets/customer/04-wallet-escrow-clean.png",
          alt: "TaskBuddy homeowner wallet screen showing a visible payment balance",
          caption: "Know what you will pay.",
          title: "Know what you will pay.",
          body: "See the payment details and what happens next in one place.",
          points: ["See payment status", "Know what is held", "Keep the details in one place"]
        },
        {
          image: "../showcase-assets/customer/05-review-clean.png",
          alt: "TaskBuddy homeowner screen for completing a review",
          caption: "Finish the job and leave a review.",
          title: "Finish the job and leave a review.",
          body: "Mark the job complete and share your experience.",
          points: ["Confirm the job is complete", "Leave a review", "See your finished jobs"]
        }
      ]
    },
    provider: {
      kicker: "For service providers",
      role: "Service Provider",
      heading: "Find jobs that fit your skills.",
      lede: "Find jobs, show your skills, and get hired.",
      steps: [
        {
          image: "../showcase-assets/provider/01-job-feed-clean.png",
          alt: "TaskBuddy provider job feed with available service requests",
          caption: "Find jobs that fit your skills.",
          title: "Find jobs that fit your skills.",
          body: "Browse requests and look for jobs that match your services.",
          points: ["Scan jobs quickly", "See key details first", "Choose the jobs you want"]
        },
        {
          image: "../showcase-assets/provider/02-verification-clean.png",
          alt: "TaskBuddy provider verification screen",
          caption: "Verify your account first.",
          title: "Verify your account first.",
          body: "Verify your account before you apply to a job.",
          points: ["Know when you can apply", "Complete each step in one place", "Help keep the platform safe"]
        },
        {
          image: "../showcase-assets/provider/03-provider-profile-clean.png",
          alt: "TaskBuddy provider profile with service information",
          caption: "Show what you can do.",
          title: "Show what you can do.",
          body: "Add your services and experience so homeowners know what you offer.",
          points: ["List your services", "Show your experience", "Help homeowners choose you"]
        },
        {
          image: "../showcase-assets/provider/04-job-detail-clean.png",
          alt: "TaskBuddy provider job details screen with work and schedule",
          caption: "See the job details first.",
          title: "See the job details first.",
          body: "Check the request, schedule, location, and homeowner details before you apply.",
          points: ["See the work and schedule", "Read the homeowner’s request", "Decide before you apply"]
        },
        {
          image: "../showcase-assets/provider/05-hired-job-clean.png",
          alt: "TaskBuddy provider hired job screen with start job and message actions",
          caption: "You got the job. Now get started.",
          title: "You got the job. Now get started.",
          body: "See the job details and start when you are ready.",
          points: ["Know when you are selected", "See booking details", "Start from the job screen"]
        }
      ]
    }
  };

  var currentRole = "customer";
  var currentIndex = 0;
  var drag = { active: false, pointerId: null, startX: 0, lastX: 0, lastTime: 0, velocity: 0 };
  var animationTimer = null;
  var animationSequence = 0;
  var CAROUSEL_EXIT_MS = 220;
  var stagedImage = image.cloneNode(false);
  var visibleImage = image;
  var imageStage = document.createElement("span");

  imageStage.className = "story-image-stage";
  stagedImage.removeAttribute("data-story-image");
  stagedImage.setAttribute("aria-hidden", "true");
  stagedImage.setAttribute("alt", "");
  stagedImage.classList.add("story-image-layer");
  image.classList.add("story-image-layer", "is-active");
  storyCapture.insertBefore(imageStage, image);
  imageStage.appendChild(image);
  imageStage.appendChild(stagedImage);

  function setImageDirection(direction) {
    image.style.setProperty("--slide-direction", direction);
    stagedImage.style.setProperty("--slide-direction", direction);
    visibleImage.style.setProperty("--slide-direction", direction);
  }

  function resetImageLayers() {
    image.classList.remove("is-active", "is-entering", "is-exiting");
    stagedImage.classList.remove("is-active", "is-entering", "is-exiting");
    visibleImage.classList.add("is-active");
    visibleImage.removeAttribute("aria-hidden");
    stagedImage.setAttribute("aria-hidden", "true");
  }

  function applyUrlState() {
    var params = new URLSearchParams(window.location.search);
    var urlRole = params.get("role");
    var urlStep = Number(params.get("step"));
    if (stories[urlRole]) currentRole = urlRole;
    if (Number.isInteger(urlStep) && urlStep >= 1 && urlStep <= stories[currentRole].steps.length) {
      currentIndex = urlStep - 1;
    }
  }

  function syncUrl() {
    var params = new URLSearchParams(window.location.search);
    params.set("role", currentRole);
    params.set("step", String(currentIndex + 1));
    window.history.replaceState({}, "", window.location.pathname + "?" + params.toString() + window.location.hash);
  }

  function updateRoleControls() {
    roleControls.forEach(function (control) {
      var active = control.getAttribute("data-role-target") === currentRole;
      if (control.matches("[role='tab']")) {
        control.setAttribute("aria-selected", active ? "true" : "false");
      }
      control.classList.toggle("is-active", active);
    });
  }

  function currentSet() {
    return stories[currentRole].steps;
  }

  function syncHeroFilm() {
    if (!heroVideo) return;
    if (heroRoleLabel) heroRoleLabel.textContent = "See how it works";
    if (heroCaption) heroCaption.textContent = "Follow a real task from request to completed job.";
  }

  function updateHeroPlaybackControl() {
    if (!heroVideo || !heroPlay) return;
    var paused = heroVideo.paused;
    heroPlay.textContent = paused ? "Play" : "Pause";
    heroPlay.setAttribute("aria-label", paused ? "Play product film" : "Pause product film");
    heroPlay.setAttribute("aria-pressed", paused ? "false" : "true");
  }

  function renderProgress() {
    progress.textContent = "";
    currentSet().forEach(function (step, stepIndex) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "progress-button" + (stepIndex === currentIndex ? " is-active" : "");
      button.setAttribute("aria-label", "Show " + stories[currentRole].role.toLowerCase() + " step " + (stepIndex + 1));
      button.setAttribute("aria-current", stepIndex === currentIndex ? "step" : "false");
      button.textContent = String(stepIndex + 1).padStart(2, "0");
      button.addEventListener("click", function () {
        setSlide(stepIndex, stepIndex >= currentIndex ? 1 : -1);
      });
      progress.appendChild(button);
    });
  }

  function setStoryHeading(set) {
    storyKicker.textContent = set.kicker;
    storyHeading.textContent = set.heading;
    storyLede.textContent = set.lede;
  }

  function cancelCarouselAnimation() {
    animationSequence += 1;
    if (animationTimer) window.clearTimeout(animationTimer);
    animationTimer = null;
    resetImageLayers();
    storyCopy.classList.remove("is-changing");
    if (storyHeadingCopy) storyHeadingCopy.classList.remove("is-changing");
  }

  function setStoryContent(set, step, targetImage) {
    setStoryHeading(set);
    (targetImage || visibleImage).src = step.image;
    (targetImage || visibleImage).alt = step.alt;
    caption.textContent = step.caption;
    number.textContent = String(currentIndex + 1).padStart(2, "0");
    roleLabel.textContent = set.role;
    title.textContent = step.title;
    body.textContent = step.body;
    points.textContent = "";
    step.points.forEach(function (point) {
      var item = document.createElement("li");
      item.textContent = point;
      points.appendChild(item);
    });
    status.textContent = set.role + " step " + (currentIndex + 1) + " of " + set.steps.length;
    renderProgress();
    syncHeroFilm();
  }

  // Warm the next asset before swapping the visible <img>. Without this, a
  // slow image response can reveal the new content halfway through its fade.
  function preloadStoryImage(src, done) {
    var preloader = new Image();
    var finished = false;
    var timeout = window.setTimeout(finish, 900);

    function finish() {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      done();
    }

    preloader.onload = finish;
    preloader.onerror = finish;
    preloader.src = src;
    if (preloader.complete) finish();
  }

  function render(shouldAnimate, shouldAnimateHeading) {
    var set = stories[currentRole];
    var step = set.steps[currentIndex];

    document.documentElement.setAttribute("data-role", currentRole);
    story.classList.toggle("story--customer", currentRole === "customer");
    story.classList.toggle("story--provider", currentRole === "provider");

    if (!shouldAnimate || isCarouselMotionReduced()) {
      cancelCarouselAnimation();
      setStoryContent(set, step);
      stagedImage.src = visibleImage.src;
      stagedImage.alt = "";
      setImageDirection(1);
      return;
    }

    cancelCarouselAnimation();
    animationSequence += 1;
    var sequence = animationSequence;
    var outgoingImage = visibleImage;
    var incomingImage = stagedImage;

    outgoingImage.classList.add("is-exiting");
    storyCopy.classList.add("is-changing");
    if (shouldAnimateHeading && storyHeadingCopy) storyHeadingCopy.classList.add("is-changing");

    preloadStoryImage(step.image, function () {
      if (sequence !== animationSequence) return;

      setStoryContent(set, step, incomingImage);
      incomingImage.classList.add("is-entering");
      // Both layers stay in the figure. The old layer fades out while the
      // preloaded new layer fades in, so there is no blank frame between them.
      void incomingImage.offsetWidth;
      window.requestAnimationFrame(function () {
        if (sequence !== animationSequence) return;
        incomingImage.classList.add("is-active");
        incomingImage.classList.remove("is-entering");
        outgoingImage.setAttribute("aria-hidden", "true");
        incomingImage.removeAttribute("aria-hidden");
        storyCopy.classList.remove("is-changing");
        if (shouldAnimateHeading && storyHeadingCopy) storyHeadingCopy.classList.remove("is-changing");

        animationTimer = window.setTimeout(function () {
          if (sequence !== animationSequence) return;
          outgoingImage.classList.remove("is-active", "is-exiting");
          incomingImage.classList.remove("is-exiting");
          visibleImage = incomingImage;
          stagedImage = outgoingImage;
          stagedImage.setAttribute("aria-hidden", "true");
          animationTimer = null;
        }, CAROUSEL_EXIT_MS);
      });
    });
  }

  function setSlide(nextIndex, direction) {
    var set = currentSet();
    currentIndex = (nextIndex + set.length) % set.length;
    syncUrl();
    setImageDirection(direction);
    render(true, false);
  }

  function switchRole(nextRole, shouldScroll) {
    if (!stories[nextRole]) return;
    var direction = nextRole === "provider" ? 1 : -1;
    currentRole = nextRole;
    currentIndex = 0;
    updateRoleControls();
    syncUrl();
    setImageDirection(direction);
    render(true, true);
    if (shouldScroll) {
      story.scrollIntoView({ behavior: isMotionReduced() ? "auto" : "smooth", block: "start" });
    }
  }

  function resetDrag() {
    if (!drag.active) return;
    drag.active = false;
    visibleImage.classList.remove("is-dragging");
    visibleImage.classList.add("is-settling");
    visibleImage.style.transform = "";
    window.setTimeout(function () {
      visibleImage.classList.remove("is-settling");
    }, 300);
  }

  function onPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    drag.active = true;
    drag.pointerId = event.pointerId;
    drag.startX = event.clientX;
    drag.lastX = event.clientX;
    drag.lastTime = performance.now();
    drag.velocity = 0;
    visibleImage.classList.add("is-dragging");
    visibleImage.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!drag.active || event.pointerId !== drag.pointerId) return;
    var now = performance.now();
    var delta = event.clientX - drag.startX;
    var stepDelta = event.clientX - drag.lastX;
    var elapsed = Math.max(1, now - drag.lastTime);
    drag.velocity = stepDelta / elapsed;
    drag.lastX = event.clientX;
    drag.lastTime = now;
    visibleImage.style.transform = "translate3d(" + delta + "px, 0, 0)";
  }

  function onPointerUp(event) {
    if (!drag.active || event.pointerId !== drag.pointerId) return;
    var delta = event.clientX - drag.startX;
    var shouldAdvance = Math.abs(delta) > 52 || Math.abs(drag.velocity) > 0.45;
    var direction = delta < 0 || drag.velocity < 0 ? 1 : -1;
    resetDrag();
    if (shouldAdvance) setSlide(currentIndex + direction, direction);
  }

  document.querySelector("[data-carousel-prev]").addEventListener("click", function () {
    setSlide(currentIndex - 1, -1);
  });

  document.querySelector("[data-carousel-next]").addEventListener("click", function () {
    setSlide(currentIndex + 1, 1);
  });

  image.addEventListener("pointerdown", onPointerDown);
  image.addEventListener("pointermove", onPointerMove);
  image.addEventListener("pointerup", onPointerUp);
  image.addEventListener("pointercancel", resetDrag);
  image.addEventListener("lostpointercapture", resetDrag);
  stagedImage.addEventListener("pointerdown", onPointerDown);
  stagedImage.addEventListener("pointermove", onPointerMove);
  stagedImage.addEventListener("pointerup", onPointerUp);
  stagedImage.addEventListener("pointercancel", resetDrag);
  stagedImage.addEventListener("lostpointercapture", resetDrag);

  carousel.tabIndex = 0;
  carousel.setAttribute("aria-label", "TaskBuddy product story carousel. Use arrow keys to change steps.");
  carousel.addEventListener("keydown", function (event) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setSlide(currentIndex + 1, 1);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setSlide(currentIndex - 1, -1);
    }
  });

  roleControls.forEach(function (control) {
    control.addEventListener("click", function () {
      switchRole(control.getAttribute("data-role-target"), !control.closest(".story"));
    });
  });

  if (heroVideo) {
    heroVideo.muted = true;
    var playAttempt = heroVideo.play();
    if (playAttempt && typeof playAttempt.catch === "function") playAttempt.catch(function () {});
    updateHeroPlaybackControl();
  }

  if (heroVideo) {
    heroVideo.addEventListener("play", function () {
      updateHeroPlaybackControl();
    });
    heroVideo.addEventListener("pause", function () {
      updateHeroPlaybackControl();
    });
  }

  if (heroPlay && heroVideo) {
    heroPlay.addEventListener("click", function () {
      if (heroVideo.paused) {
        heroVideo.muted = true;
        var playAttempt = heroVideo.play();
        if (playAttempt && typeof playAttempt.catch === "function") playAttempt.catch(function () {
          updateHeroPlaybackControl();
        });
      } else {
        heroVideo.pause();
      }
    });
  }

  var menuToggle = document.querySelector(".menu-toggle");
  var siteNav = document.querySelector(".site-nav");
  var siteHeader = document.querySelector(".site-header");
  var gsapApi = window.gsap;
  var scrollTriggerApi = window.ScrollTrigger;
  var reduceMotionQuery = { get matches() { return isMotionReduced(); } };
  var gsapMotionEnabled = Boolean(gsapApi && scrollTriggerApi);
  if (gsapMotionEnabled) {
    gsapApi.registerPlugin(scrollTriggerApi);
    document.documentElement.classList.add("gsap-enabled");
  }
  var lastScrollY = window.scrollY;
  var scrollFrame = null;
  var scrollThreshold = 4;
  var scrollDirection = 0;
  var scrollDistance = 0;
  var headerScrollReady = false;
  var headerHidden = false;

  function setHeaderVisibility(hidden) {
    if (!siteHeader) return;
    if (headerHidden === hidden) return;
    headerHidden = hidden;
    if (gsapMotionEnabled && !reduceMotionQuery.matches) {
      siteHeader.classList.toggle("is-hidden", hidden);
      gsapApi.to(siteHeader, {
        yPercent: hidden ? -125 : 0,
        autoAlpha: hidden ? 0 : 1,
        duration: hidden ? 0.28 : 0.34,
        ease: "power3.out",
        overwrite: "auto"
      });
      return;
    }
    siteHeader.classList.toggle("is-hidden", hidden);
  }

  function headerHasFocus() {
    return Boolean(siteHeader && document.activeElement && siteHeader.contains(document.activeElement));
  }

  function updateHeaderOnScroll() {
    if (!siteHeader) return;
    var currentScrollY = window.scrollY;
    var scrollDelta = currentScrollY - lastScrollY;

    if (!headerScrollReady) {
      lastScrollY = currentScrollY;
      scrollDirection = 0;
      scrollDistance = 0;
      scrollFrame = null;
      return;
    }

    if (currentScrollY <= 12) {
      setHeaderVisibility(false);
      scrollDirection = 0;
      scrollDistance = 0;
    } else {
      var nextDirection = scrollDelta > 0 ? 1 : scrollDelta < 0 ? -1 : 0;
      if (nextDirection !== 0) {
        if (nextDirection !== scrollDirection) {
          scrollDirection = nextDirection;
          scrollDistance = 0;
        }
        scrollDistance += Math.abs(scrollDelta);
        if (scrollDistance >= scrollThreshold) {
          if (nextDirection > 0) {
            if (!siteNav.classList.contains("is-open") && !headerHasFocus()) setHeaderVisibility(true);
          } else {
            setHeaderVisibility(false);
          }
          scrollDistance = 0;
        }
      }
    }

    lastScrollY = currentScrollY;
    scrollFrame = null;
  }

  window.addEventListener("scroll", function () {
    if (scrollFrame !== null) return;
    scrollFrame = window.requestAnimationFrame(updateHeaderOnScroll);
  }, { passive: true });

  if (siteHeader) {
    siteHeader.addEventListener("focusin", function () {
      setHeaderVisibility(false);
    });
  }

  function armHeaderScroll() {
    window.requestAnimationFrame(function () {
      lastScrollY = window.scrollY;
      headerScrollReady = true;
    });
  }

  // The hero is deliberately NOT in this list — it is above the fold on load,
  // so it gets a load entrance (.is-ready) instead of a scroll-tied reveal.
  var revealTargets = document.querySelectorAll(
    ".story-heading, .story-carousel, " +
    ".about-buddy__art, .about-buddy__copy, .about-buddy__steps li, " +
    ".features__intro, .features__list .feature-row, " +
    ".services__head, .services__list .service-row, " +
    ".faq__intro, .faq-list details, " +
    ".download__content, .download__points li, .download__art"
  );

  var REVEAL_STAGGER_MS = 45; // purely a timing lag now, never a position requirement
  var REVEAL_STAGGER_CAP = 5;
  var STAGGERED_SELECTOR = ".about-buddy__steps li, .features__list .feature-row, .services__list .service-row, .faq-list details, .download__points li";

  function revealDirectionFor(target) {
    if (target.matches(".story-heading__copy, .about-buddy__copy, .features__intro, .services__head, .faq__intro, .download__content")) return "from-left";
    if (target.matches(".about-buddy__art, .download__art")) return "from-right";
    return "from-up";
  }

  // Each element tracks its OWN scroll position — that's what makes the
  // reveal actually visible as you scroll a section's later content into
  // view, instead of the whole section snapping to "done" the moment its
  // first pixel appears. (A version that shared the enclosing <section>'s
  // position was tried and made everything in a section look pre-loaded —
  // reverted.) The bug that motivated moving away from per-element position
  // in the first place was narrower than that: stagger was being added
  // directly into the position math (see the old revealStaggerPxFor), which
  // meant a list item low in a section needed MORE scroll than the section
  // itself had left to give. The actual fix for that is below — stagger is
  // now purely a transition-delay, never a position requirement — so
  // per-element tracking is safe to use everywhere again.
  function revealPositionSourceFor(target) {
    return target;
  }

  function revealStaggerMsFor(target) {
    if (!target.matches(STAGGERED_SELECTOR) || !target.parentElement) return 0;
    var index = Array.prototype.indexOf.call(target.parentElement.children, target);
    return Math.min(Math.max(index, 0), REVEAL_STAGGER_CAP) * REVEAL_STAGGER_MS;
  }

  function startHeroEntrance() {
    var hero = document.querySelector(".hero");
    if (!hero) return;
    hero.classList.add("is-ready");
    if (gsapMotionEnabled && !reduceMotionQuery.matches) {
      var heroCopyItems = hero.querySelectorAll(".hero__copy > *");
      gsapApi.fromTo(heroCopyItems,
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.58, stagger: 0.07, ease: "power3.out", clearProps: "transform" }
      );
      var heroVisual = hero.querySelector(".hero__visual");
      if (heroVisual) {
        gsapApi.fromTo(heroVisual,
          { opacity: 0, x: 32 },
          { opacity: 1, x: 0, duration: 0.72, delay: 0.1, ease: "power3.out", clearProps: "transform" }
        );
      }
    }
  }

  // Fallback scroll motion for when the local GSAP files cannot load. Each
  // reveal progresses with its own element and locks after reaching its
  // finished state, matching the one-time GSAP entrance below.
  //   [data-sc-parallax]  0 at the top of the page, 1 a viewport-height down.
  var scProgressTargets = [];
  var scParallaxTargets = [];
  var scFrame = null;

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function updateScrollDevices() {
    scFrame = null;
    var viewportH = window.innerHeight;
    scProgressTargets.forEach(function (entry) {
      if (entry.locked) return;
      var rect = entry.posEl.getBoundingClientRect();
      // Travel distance is the element's OWN height (plus a fixed buffer),
      // not a fixed fraction of the viewport. A fixed viewport fraction
      // requires the element's top to reach a specific spot near mid-screen
      // to count as "done" — fine for something positioned high up, but a
      // short block sitting lower on the page can be 100% on screen and
      // still never satisfy that. Scaling to the element's own size means
      // "fully on screen" and "fully revealed" actually coincide.
      var travel = Math.max(rect.height, 40) + 140;
      var progress = clamp01((viewportH - rect.top) / travel);
      entry.el.style.setProperty("--sc-p", progress.toFixed(3));
      if (progress > 0.02 && entry.section) entry.section.classList.add("is-lit");
      if (entry.isRevealTarget && progress >= 1) entry.locked = true;
    });
    scParallaxTargets.forEach(function (target) {
      var progress = clamp01(window.scrollY / viewportH);
      target.style.setProperty("--sc-p", progress.toFixed(3));
    });
  }

  function initScrollDevices() {
    if (gsapMotionEnabled) {
      initGsapMotion();
      return;
    }
    if (reduceMotionQuery.matches) return;
    var revealTargetSet = new Set();
    var plainProgressEls = Array.prototype.slice.call(document.querySelectorAll("[data-sc-progress]"));
    revealTargets.forEach(function (target) {
      target.classList.add("reveal-target", "reveal-target--" + revealDirectionFor(target));
      target.style.transitionDelay = revealStaggerMsFor(target) + "ms";
      revealTargetSet.add(target);
      plainProgressEls.push(target);
    });
    scProgressTargets = plainProgressEls.map(function (el) {
      return {
        el: el,
        posEl: revealPositionSourceFor(el),
        section: el.closest("section"),
        isRevealTarget: revealTargetSet.has(el),
        locked: false,
      };
    });
    scParallaxTargets = Array.prototype.slice.call(document.querySelectorAll("[data-sc-parallax]"));
    if (!scProgressTargets.length && !scParallaxTargets.length) return;
    updateScrollDevices();
    window.addEventListener("scroll", function () {
      if (scFrame !== null) return;
      scFrame = window.requestAnimationFrame(updateScrollDevices);
    }, { passive: true });
    window.addEventListener("resize", updateScrollDevices, { passive: true });
  }

  function gsapRevealFrom(target) {
    var direction = revealDirectionFor(target);
    if (direction === "from-left") return { opacity: 0, x: -32, y: 0 };
    if (direction === "from-right") return { opacity: 0, x: 32, y: 0 };
    return { opacity: 0, x: 0, y: 32 };
  }

  function initGsapMotion() {
    if (!gsapMotionEnabled) return;
    if (reduceMotionQuery.matches) {
      revealTargets.forEach(function (target) {
        target.classList.add("reveal-target", "is-revealed");
      });
      return;
    }

    revealTargets.forEach(function (target) {
      target.classList.add("reveal-target", "reveal-target--" + revealDirectionFor(target));
      gsapApi.fromTo(target, gsapRevealFrom(target), {
        opacity: 1,
        x: 0,
        y: 0,
        duration: 0.6,
        delay: revealStaggerMsFor(target) / 1000,
        ease: "power3.out",
        clearProps: "transform",
        scrollTrigger: {
          trigger: target,
          start: "top 82%",
          toggleActions: "play none none none"
        }
      });
    });

    [".features", ".services", ".faq"].forEach(function (selector) {
      var section = document.querySelector(selector);
      if (!section) return;
      gsapApi.fromTo(section, { "--line-scale": 0 }, {
        "--line-scale": 1,
        duration: 0.8,
        ease: "power2.inOut",
        scrollTrigger: {
          trigger: section,
          start: "top 72%",
          toggleActions: "play none none none"
        }
      });
    });

    var hero = document.querySelector(".hero");
    var heroVisual = document.querySelector("[data-sc-parallax]");
    if (hero && heroVisual) {
      gsapApi.to(heroVisual, {
        y: -18,
        ease: "none",
        scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 0.7 }
      });
    }

    var storyMedia = document.querySelector("[data-sc-progress]");
    if (storyMedia) {
      gsapApi.fromTo(storyMedia, { scale: 0.965 }, {
        scale: 1,
        ease: "none",
        scrollTrigger: { trigger: storyMedia, start: "top 88%", end: "top 35%", scrub: 0.7 }
      });
    }

    window.setTimeout(function () {
      scrollTriggerApi.refresh();
    }, 120);
  }

  startHeroEntrance();
  initScrollDevices();

  if (document.readyState === "complete") {
    armHeaderScroll();
  } else {
    window.addEventListener("load", armHeaderScroll, { once: true });
  }

  menuToggle.addEventListener("click", function () {
    var open = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", open ? "false" : "true");
    siteNav.classList.toggle("is-open", !open);
  });

  siteNav.addEventListener("click", function (event) {
    if (event.target.closest("a")) {
      menuToggle.setAttribute("aria-expanded", "false");
      siteNav.classList.remove("is-open");
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" || !siteNav.classList.contains("is-open")) {
      return;
    }

    siteNav.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.focus();
  });

  applyUrlState();
  updateRoleControls();
  window.addEventListener("popstate", function () {
    applyUrlState();
    updateRoleControls();
    render(false);
  });
  render(false);
})();
