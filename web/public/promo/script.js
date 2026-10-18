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
  var guideLink = document.querySelector("[data-story-guide]");
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
  function isMotionDisabled() {
    return motionOverride === "off";
  }
  if (isMotionDisabled()) {
    document.documentElement.classList.add("motion-override-off");
  } else {
    document.documentElement.classList.add("motion-override-on");
  }

  var stories = {
    customer: {
      kicker: "For clients",
      role: "Client",
      heading: "Find the right person for the job.",
      lede: "Pick a service, compare proposals, and hire with confidence.",
      steps: [
        {
          image: "/film/story/customer-1.jpg",
          video: "/film/story/customer-1.mp4",
          alt: "TaskBuddy sign-up: choosing Client, entering details and verifying the email",
          caption: "Create your account.",
          title: "Create your account.",
          body: "Sign up in the app and verify your email to start posting jobs.",
          lesson: "create-your-account",
          lessonTitle: "Create your account"
        },
        {
          image: "/film/story/customer-2.jpg",
          video: "/film/story/customer-2.mp4",
          alt: "TaskBuddy client home screen with the Post a job card",
          caption: "Start with what you need.",
          title: "Start with what you need.",
          body: "Find a service, check your active jobs, and take the next step.",
          lesson: "your-home-screen",
          lessonTitle: "Your Home screen"
        },
        {
          image: "/film/story/customer-3.jpg",
          video: "/film/story/customer-3.mp4",
          alt: "Client posting a job: service, address, tasks, urgency and a price option",
          caption: "Tell providers what you need.",
          title: "Tell providers what you need.",
          body: "Pick a service, its tasks and urgency, then choose one of three estimated price options.",
          lesson: "post-a-job",
          lessonTitle: "Post a job"
        },
        {
          image: "/film/story/customer-4.jpg",
          video: "/film/story/customer-4.mp4",
          alt: "Client reviewing a proposal, hiring the provider and paying",
          caption: "Compare proposals, then hire.",
          title: "Compare proposals, then hire.",
          body: "Check each provider’s rating, certificate and message, then hire and pay safely.",
          lesson: "compare-proposals-and-hire",
          lessonTitle: "Compare proposals and hire"
        },
        {
          image: "/film/story/customer-5.jpg",
          video: "/film/story/customer-5.mp4",
          alt: "Client confirming the job is done and rating the provider",
          caption: "Follow the job, then confirm and review.",
          title: "Follow the job, then confirm and review.",
          body: "Follow the checklist and proof photos, confirm the job is done or report a problem, then leave a review.",
          lesson: "track-confirm-and-review",
          lessonTitle: "Track, confirm and review"
        }
      ]
    },
    provider: {
      kicker: "For providers",
      role: "Provider",
      heading: "Find jobs that fit your skills.",
      lede: "Find jobs, send proposals, and get paid.",
      steps: [
        {
          image: "/film/story/provider-1.jpg",
          video: "/film/story/provider-1.mp4",
          alt: "TaskBuddy sign-up as a provider with a skill category and email code",
          caption: "Create your provider account.",
          title: "Create your provider account.",
          body: "Sign up as a provider and set up your profile.",
          lesson: "provider-create-account",
          lessonTitle: "Create your account"
        },
        {
          image: "/film/story/provider-2.jpg",
          video: "/film/story/provider-2.mp4",
          alt: "Provider setup: ID photo, selfie, certificate and review",
          caption: "Finish your setup first.",
          title: "Finish your setup first.",
          body: "Add your ID, a selfie, a certificate for each service, and a payout account before you send proposals.",
          lesson: "provider-get-verified",
          lessonTitle: "Get verified and set up payouts"
        },
        {
          image: "/film/story/provider-3.jpg",
          video: "/film/story/provider-3.mp4",
          alt: "Provider feed of jobs near you with a new job arriving",
          caption: "Find jobs that fit your skills.",
          title: "Find jobs that fit your skills.",
          body: "Browse requests and look for jobs that match your services.",
          lesson: "provider-your-feed",
          lessonTitle: "Your Feed"
        },
        {
          image: "/film/story/provider-4.jpg",
          video: "/film/story/provider-4.mp4",
          alt: "Provider reviewing job details and sending a proposal",
          caption: "See the job details first.",
          title: "See the job details first.",
          body: "Check the work, schedule, location and the price you would receive before you send a proposal.",
          lesson: "provider-send-a-proposal",
          lessonTitle: "Send a proposal"
        },
        {
          image: "/film/story/provider-5.jpg",
          video: "/film/story/provider-5.mp4",
          alt: "Provider starting the job and adding a proof photo for each task",
          caption: "You got the job. Now get started.",
          title: "You got the job. Now get started.",
          body: "Do the tasks and add proof photos, then wait for the client to confirm.",
          lesson: "provider-do-the-job",
          lessonTitle: "Do the job"
        },
        {
          image: "/film/story/provider-6.jpg",
          video: "/film/story/provider-6.mp4",
          alt: "Provider Earnings screen with a payment released to GCash",
          caption: "Get paid automatically.",
          title: "Get paid automatically.",
          body: "Once the client confirms, your pay arrives in your payout account automatically, listed in Earnings.",
          lesson: "provider-get-paid",
          lessonTitle: "Get paid"
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

  // Each step has a short silent loop of the current app UI. Its first frame is
  // the step's poster image, so the clip fades in over an identical picture once
  // a slide has settled; posters alone carry swipes, transitions and reduced motion.
  var storyVideo = document.createElement("video");
  var storyVideoToken = 0;
  var storyInView = false;
  storyVideo.className = "story-video";
  storyVideo.muted = true;
  storyVideo.loop = true;
  storyVideo.playsInline = true;
  storyVideo.setAttribute("playsinline", "");
  storyVideo.setAttribute("aria-hidden", "true");
  storyVideo.preload = "auto";
  imageStage.appendChild(storyVideo);

  function hideStoryVideo() {
    storyVideoToken += 1;
    storyVideo.classList.remove("is-visible");
    storyVideo.pause();
  }

  function playStoryVideo() {
    var step = stories[currentRole].steps[currentIndex];
    hideStoryVideo();
    if (!step.video || !storyInView || isMotionDisabled()) return;
    var token = storyVideoToken;
    if (storyVideo.getAttribute("src") !== step.video) storyVideo.setAttribute("src", step.video);
    try { storyVideo.currentTime = 0; } catch (error) { /* not loaded yet */ }
    function onPlaying() {
      storyVideo.removeEventListener("playing", onPlaying);
      if (token === storyVideoToken) storyVideo.classList.add("is-visible");
    }
    storyVideo.addEventListener("playing", onPlaying);
    var attempt = storyVideo.play();
    if (attempt && typeof attempt.catch === "function") attempt.catch(function () {});
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      storyInView = entries[0].isIntersecting;
      if (storyInView) playStoryVideo();
      else hideStoryVideo();
    }, { threshold: 0.25 }).observe(storyCapture);
  } else {
    storyInView = true;
  }
  // Browsers defer playback in background tabs; retry once the page is shown.
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && storyInView && storyVideo.paused) playStoryVideo();
  });

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
    if (heroCaption) heroCaption.textContent = "One job, two apps: from request to paid.";
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
    guideLink.setAttribute("href", "/guide#" + step.lesson);
    guideLink.setAttribute("aria-label", "Watch the guide: " + step.lessonTitle);
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

    hideStoryVideo();

    if (!shouldAnimate || isMotionDisabled()) {
      cancelCarouselAnimation();
      setStoryContent(set, step);
      stagedImage.src = visibleImage.src;
      stagedImage.alt = "";
      setImageDirection(1);
      playStoryVideo();
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
          playStoryVideo();
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
      story.scrollIntoView({ behavior: isMotionDisabled() ? "auto" : "smooth", block: "start" });
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
    hideStoryVideo();
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
    else window.setTimeout(playStoryVideo, 300);
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

  // Full product film (with sound) in a dialog; the hero keeps its muted loop.
  var filmModal = document.querySelector("[data-film-modal]");
  var filmVideo = document.querySelector("[data-film-video]");
  var filmOpen = document.querySelector("[data-film-open]");
  var heroWasPlaying = false;

  function closeFilm() {
    if (!filmModal || filmModal.hidden) return;
    filmVideo.pause();
    filmModal.hidden = true;
    document.documentElement.classList.remove("has-modal-open");
    document.body.classList.remove("has-modal-open");
    document.removeEventListener("keydown", onFilmKey);
    if (heroVideo && heroWasPlaying) {
      var resume = heroVideo.play();
      if (resume && typeof resume.catch === "function") resume.catch(function () {});
    }
    if (filmOpen) filmOpen.focus();
  }

  function onFilmKey(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeFilm();
    }
  }

  if (filmModal && filmVideo && filmOpen) {
    filmOpen.addEventListener("click", function () {
      heroWasPlaying = !!heroVideo && !heroVideo.paused;
      if (heroVideo) heroVideo.pause();
      filmModal.hidden = false;
      document.documentElement.classList.add("has-modal-open");
      document.body.classList.add("has-modal-open");
      document.addEventListener("keydown", onFilmKey);
      filmVideo.currentTime = 0;
      filmVideo.muted = false;
      var attempt = filmVideo.play();
      if (attempt && typeof attempt.catch === "function") attempt.catch(function () {});
      var closeButton = filmModal.querySelector(".film-modal__close");
      if (closeButton) closeButton.focus();
    });
    filmModal.querySelectorAll("[data-film-close]").forEach(function (el) {
      el.addEventListener("click", closeFilm);
    });
  }

  var menuToggle = document.querySelector(".menu-toggle");
  var siteNav = document.querySelector(".site-nav");
  var siteHeader = document.querySelector(".site-header");
  var gsapApi = window.gsap;
  var scrollTriggerApi = window.ScrollTrigger;
  var motionDisabledQuery = { get matches() { return isMotionDisabled(); } };
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
    if (gsapMotionEnabled && !motionDisabledQuery.matches) {
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
    ".story-heading, .story-carousel, .proof__head, .proof__stats .proof-stat, " +
    ".about-buddy__art, .about-buddy__copy, .about-buddy__steps li, " +
    ".features__intro, .features__list .feature-row, " +
    ".services__head, .services__list .service-row, " +
    ".faq__intro, .faq-list details, " +
    ".download__content, .download__points li, .download__art"
  );

  var REVEAL_STAGGER_MS = 45; // purely a timing lag now, never a position requirement
  var REVEAL_STAGGER_CAP = 5;
  var STAGGERED_SELECTOR = ".about-buddy__steps li, .features__list .feature-row, .services__list .service-row, .faq-list details, .download__points li, .proof__stats .proof-stat";

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
    if (gsapMotionEnabled && !motionDisabledQuery.matches) {
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
    if (motionDisabledQuery.matches) return;
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
    if (motionDisabledQuery.matches) {
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
