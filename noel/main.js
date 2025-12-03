(function () {
    const openBtn = document.getElementById('openBtn');
    const card = document.querySelector('.card');
    const cardInner = document.getElementById('cardInner');
    const template = document.getElementById('cardContent');
    const audio = document.getElementById('audio');

    let opened = false;
    let contentLoaded = false;

    // Snowfall effect (canvas)
    const snowCanvas = document.getElementById('snowCanvas');
    let snowCtx = null;
    let snowFlakes = [];
    let snowAnimId = null;
    let snowDpr = window.devicePixelRatio || 1;

    // device / accessibility detection
    const isNarrow = window.matchMedia('(max-width:600px)').matches;
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function createFlake(width, height) {
        // adapt flake sizes / speed for narrow screens
        const mobileFactor = isNarrow || isTouch ? 0.6 : 1;
        // larger flakes more visible: many medium plus some large ones
        const largeChance = Math.random();
        const size = largeChance < 0.12 ? (6 * mobileFactor + Math.random() * 6 * mobileFactor) : (2 * mobileFactor + Math.random() * 4 * mobileFactor); // radius
        return {
            x: Math.random() * width,
            y: Math.random() * -height,
            r: size,
            // slower vertical speed for gentle fall on desktop, even slower on mobile
            vy: (0.15 + Math.random() * 0.6) * (isNarrow ? 0.9 : 1),
            // gentler horizontal drift
            vx: (Math.random() - 0.5) * (isNarrow ? 0.25 : 0.3),
            swing: Math.random() * Math.PI * 2,
            // slower swing for smoother motion
            swingSpeed: (0.001 + Math.random() * 0.003) * (isNarrow ? 0.8 : 1),
            alpha: 0.65 + Math.random() * 0.35
        };
    }

    function resizeSnow() {
        if (!snowCanvas) return;
        const rect = card.getBoundingClientRect();
        snowDpr = window.devicePixelRatio || 1;
        snowCanvas.width = Math.max(1, Math.floor(rect.width * snowDpr));
        snowCanvas.height = Math.max(1, Math.floor(rect.height * snowDpr));
        snowCanvas.style.width = rect.width + 'px';
        snowCanvas.style.height = rect.height + 'px';
        snowCtx = snowCanvas.getContext('2d');
        snowCtx.setTransform(snowDpr, 0, 0, snowDpr, 0, 0);

        // adjust number of flakes based on size and device
        const areaFactor = Math.max(0.5, (rect.width * rect.height) / (800 * 600));
        // reduce density on narrow/touch screens or when user prefers reduced motion
        const base = prefersReducedMotion ? 0 : (isNarrow || isTouch ? 35 : 70);
        const target = Math.round(base * areaFactor);
        while (snowFlakes.length < target) snowFlakes.push(createFlake(rect.width, rect.height));
        while (snowFlakes.length > target) snowFlakes.pop();
    }

    let lastSnowT = performance.now();
    function animateSnow(now) {
        if (!snowCtx) return;
        const rect = card.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const dt = Math.min(50, now - lastSnowT) / 16.6667; // normalize to ~60fps
        lastSnowT = now;

        snowCtx.clearRect(0, 0, width, height);
        snowFlakes.forEach(f => {
            // slower per-frame advancement for a gentle fall
            f.swing += f.swingSpeed * dt * (isNarrow ? 6 : 10);
            f.x += f.vx * dt * (isNarrow ? 6 : 10) + Math.sin(f.swing) * (isNarrow ? 0.14 : 0.2);
            f.y += f.vy * dt * (isNarrow ? 6 : 10);
            if (f.y > height + 10) {
                // respawn at top
                f.x = Math.random() * width;
                f.y = -10 - Math.random() * 60;
                f.vy = (0.4 + Math.random() * 1.2) * (isNarrow ? 0.9 : 1);
            }

            // draw with subtle glow for larger, clearer flakes
            snowCtx.save();
            snowCtx.beginPath();
            snowCtx.fillStyle = 'rgba(255,255,255,' + (f.alpha) + ')';
            // reduce blur on narrow devices for performance
            if (f.r > 5 && !isNarrow) {
                snowCtx.shadowBlur = 8;
                snowCtx.shadowColor = 'rgba(255,255,255,0.9)';
            } else {
                snowCtx.shadowBlur = 1;
                snowCtx.shadowColor = 'rgba(255,255,255,0.6)';
            }
            snowCtx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
            snowCtx.fill();
            snowCtx.restore();
        });

        snowAnimId = requestAnimationFrame(animateSnow);
    }

    function startSnow() {
        if (!snowCanvas) return;
        // do not start snow if user prefers reduced motion
        if (prefersReducedMotion) return;
        resizeSnow();
        lastSnowT = performance.now();
        if (!snowAnimId) snowAnimId = requestAnimationFrame(animateSnow);
    }

    function stopSnow() {
        if (snowAnimId) cancelAnimationFrame(snowAnimId);
        snowAnimId = null;
    }

    window.addEventListener('resize', () => {
        resizeSnow();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopSnow(); else startSnow();
    });

    // Helper: load a single external script and return a Promise
    // We fetch first so we can detect HTML redirects (e.g. GSAP trial landing page)
    // and avoid injecting non-JS into the document which would break the page.
    async function loadExternalScript(src, type = 'text/javascript') {
        try {
            // try to fetch the resource as text first
            const resp = await fetch(src, { cache: 'no-cache', mode: 'cors' });
            if (!resp.ok) throw new Error('Network response was not ok');
            const text = await resp.text();

            // simple heuristics to detect HTML/error pages
            const lowered = text.slice(0, 200).toLowerCase();
            if (lowered.indexOf('<!doctype') !== -1 || lowered.indexOf('<html') !== -1 || lowered.indexOf('oops!') !== -1 || lowered.indexOf('requires-membership') !== -1) {
                console.warn('Skipping script because fetched resource looks like HTML or a landing page:', src);
                return null; // resolve gracefully, don't throw
            }

            // inject the fetched JS as an inline script (preserves order)
            const s = document.createElement('script');
            if (type === 'module') s.type = 'module';
            s.async = false;
            s.textContent = text;
            document.body.appendChild(s);
            return s;
        } catch (err) {
            // fetch failed (CORS or network). Fall back to adding a script tag with src.
            return new Promise((resolve) => {
                const s = document.createElement('script');
                s.src = src;
                if (type === 'module') s.type = 'module';
                s.async = false;
                s.onload = () => resolve(s);
                s.onerror = (e) => {
                    console.warn('Failed to load external script (fallback) ', src, e);
                    resolve(null);
                };
                document.body.appendChild(s);
            });
        }
    }

    // Helper: execute inline script content
    function runInlineScript(code, asModule = false) {
        const s = document.createElement('script');
        if (asModule) s.type = 'module';
        s.textContent = code;
        document.body.appendChild(s);
        return s;
    }

    // Inject template content into cardInner and execute scripts in order
    async function injectContentOnce() {
        if (contentLoaded) return;
        const tpl = template.content.cloneNode(true);

        // Separate script templates and non-script nodes
        const scriptTemplates = [];
        const nonScriptNodes = [];
        const nodes = Array.from(tpl.childNodes);
        nodes.forEach(node => {

            if (node.tagName && node.tagName.toLowerCase() === 'script' && node.type === 'text/template') {
                scriptTemplates.push(node);
            } else {
                nonScriptNodes.push(node);
            }
                       });

        // 1) Load all external scripts (in order)
        for (const sTpl of scriptTemplates) {
            const dataSrc = sTpl.getAttribute('data-src');
            const dataType = sTpl.getAttribute('data-type') || 'text/javascript';
            if (dataType === 'text/javascript') {
                // Regular script
                await loadExternalScript(dataSrc, dataType);
            } else if (dataType === 'module') {
                // Module script
                await loadExternalScript(dataSrc, dataType);
            }
        }

        // 2) Execute all inline scripts (in order)
        for (const node of nodes) {
            if (node.tagName && node.tagName.toLowerCase() === 'script' && node.type === 'text/template') {
                // Execute inline script
                const code = node.innerHTML;
                runInlineScript(code, node.getAttribute('data-type') === 'module');
            } else {
                // Append non-script nodes directly
                cardInner.appendChild(node);
            }
        }

        contentLoaded = true;
    }

    // Open/close card function with staged classes for book-fold effect
    var openTl = null;

    function createOpenTimeline() {
        if (prefersReducedMotion) return null;
        if (!window.gsap) return null;
        // create a timeline that emulates a slow page-turn
        var tl = gsap.timeline({ paused: true });

        // ensure 3D rendering
        gsap.set(['.card-cover', '.pages', '.card-inner'], { transformStyle: 'preserve-3d', force3D: true });

        // big page flip: adapt duration/intensity for narrow screens
        const mainDur = isNarrow ? 1.2 : 1.8;
        const settleDur = isNarrow ? 0.45 : 0.8;
        const pageRotation = isNarrow ? -140 : -160;
        tl.to('.pages', { duration: mainDur, rotationY: pageRotation, transformOrigin: 'left center', ease: 'power2.inOut' }, 0)
            .to('.card-cover', { duration: mainDur, rotationY: -180, transformOrigin: 'left center', ease: 'power2.inOut' }, 0)
            .to('.card-inner', { duration: mainDur, rotationY: isNarrow ? 6 : 10, x: isNarrow ? '8%' : '12%', z: isNarrow ? 4 : 8, ease: 'power2.out' }, 0.03)
            // settle back the pages to a readable lean
            .to('.pages', { duration: settleDur, rotationY: -12, ease: 'elastic.out(1, 0.6)' }, '>-0.15');

        return tl;
    }

    // Open/close card function with GSAP timeline when available
    function toggleCard(open) {
        // create timeline on demand after content scripts are loaded
        if (!openTl && typeof window.gsap !== 'undefined') {
            openTl = createOpenTimeline();
        }

        if (open) {
            if (openTl) {
                // play GSAP timeline
                card.classList.add('opening');
                openTl.play(0);
                // ensure final state class for non-GSAP CSS rules
                setTimeout(() => card.classList.add('open'), 2200);
            } else {
                // CSS fallback
                card.classList.add('opening');
                requestAnimationFrame(() => card.classList.add('open'));
            }
            audio.play().catch(e => {});
        } else {
            if (openTl) {
                // reverse timeline for smooth close
                openTl.reverse();
                // remove 'open' class immediately so CSS reverses too
                card.classList.remove('open');
                // remove opening marker after timeline reverse duration
                setTimeout(() => card.classList.remove('opening'), 2500);
            } else {
                card.classList.remove('open');
                setTimeout(() => card.classList.remove('opening'), 2500);
            }
            audio.pause();
            audio.currentTime = 0;
        }
        opened = open;
    }

    // Initial setup: inject content and close card
    injectContentOnce().then(() => {
        toggleCard(false);
        // start snowfall after layout is ready
        startSnow();
    });

    // Open button click handler
    openBtn.addEventListener('click', () => {
        const isOpen = openBtn.getAttribute('aria-pressed') === 'true';
        toggleCard(!isOpen);
        openBtn.setAttribute('aria-pressed', !isOpen);
    });

    // Close card when clicking outside of it
    document.addEventListener('click', (e) => {
        if (opened && !card.contains(e.target) && e.target !== openBtn) {
            toggleCard(false);
            openBtn.setAttribute('aria-pressed', 'false');
        }
    });
})();
