/**
 * RETRO ARCADE // ANIMAL SIGHTINGS DEX
 * Interactive game engine: WebAudio SFX, Collection tracking, Filters, Modal, and Pixel Confetti.
 */

(function () {
	'use strict';

	// =========================================================================
	// STATE & STORAGE
	// =========================================================================
	const STORAGE_KEY_COLLECTED = 'arcade_collected_ids';
	const STORAGE_KEY_MUTED = 'arcade_muted';
	const STORAGE_KEY_CRT = 'arcade_crt_enabled';
	const STORAGE_KEY_HISCORE = 'arcade_quiz_hiscore';

	let collectedIds = new Set();
	try {
		const raw = localStorage.getItem(STORAGE_KEY_COLLECTED);
		if (raw) {
			collectedIds = new Set(JSON.parse(raw));
		}
	} catch (e) {
		console.warn('localStorage read error for collection:', e);
	}

	let isMuted = localStorage.getItem(STORAGE_KEY_MUTED) === 'true';
	let isCrtEnabled = localStorage.getItem(STORAGE_KEY_CRT) !== 'false';

	let currentModalCard = null;

	// =========================================================================
	// WEBAUDIO RETRO SYNTHESIZER
	// =========================================================================
	let audioCtx = null;

	function getAudioContext() {
		if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
			const AudioContextClass = window.AudioContext || window.webkitAudioContext;
			audioCtx = new AudioContextClass();
		}
		if (audioCtx && audioCtx.state === 'suspended') {
			audioCtx.resume();
		}
		return audioCtx;
	}

	function playTone(freq, type, duration, startTimeOffset, gainLevel) {
		if (isMuted) return;
		try {
			const ctx = getAudioContext();
			if (!ctx) return;

			const osc = ctx.createOscillator();
			const gain = ctx.createGain();

			osc.type = type || 'square';
			osc.frequency.setValueAtTime(freq, ctx.currentTime + startTimeOffset);

			const g = gainLevel || 0.08;
			gain.gain.setValueAtTime(g, ctx.currentTime + startTimeOffset);
			gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startTimeOffset + duration);

			osc.connect(gain);
			gain.connect(ctx.destination);

			osc.start(ctx.currentTime + startTimeOffset);
			osc.stop(ctx.currentTime + startTimeOffset + duration);
		} catch (e) {
			// Ignore audio failure on restricted browsers
		}
	}

	function playBlipSound() {
		playTone(880, 'square', 0.06, 0, 0.05);
	}

	function playCollectSound() {
		// Cheerful 4-note ascending chime (C5 -> E5 -> G5 -> C6)
		playTone(523.25, 'square', 0.08, 0.0, 0.08);
		playTone(659.25, 'square', 0.08, 0.07, 0.08);
		playTone(783.99, 'square', 0.08, 0.14, 0.08);
		playTone(1046.50, 'square', 0.18, 0.21, 0.1);
	}

	function playUncollectSound() {
		// Descending tone
		playTone(440, 'triangle', 0.08, 0.0, 0.08);
		playTone(330, 'triangle', 0.12, 0.07, 0.08);
	}

	function playModalSound() {
		playTone(587.33, 'square', 0.06, 0.0, 0.06);
		playTone(880.00, 'square', 0.12, 0.05, 0.07);
	}

	function playWrongSound() {
		playTone(196, 'sawtooth', 0.12, 0.0, 0.07);
		playTone(147, 'sawtooth', 0.25, 0.1, 0.07);
	}

	function playTickSound() {
		playTone(1320, 'square', 0.03, 0, 0.03);
	}

	function playGameOverSound() {
		// Classic falling arpeggio
		[659.25, 587.33, 523.25, 392.0, 261.63].forEach((f, i) => {
			playTone(f, 'square', 0.14, i * 0.13, 0.07);
		});
	}

	function playStartSound() {
		[392.0, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
			playTone(f, 'square', 0.07, i * 0.06, 0.06);
		});
	}

	// =========================================================================
	// PIXEL CONFETTI SYSTEM
	// =========================================================================
	const canvas = document.getElementById('confetti-canvas');
	let ctxCanvas = canvas ? canvas.getContext('2d') : null;
	let particles = [];
	let animationFrameId = null;

	function resizeCanvas() {
		if (!canvas) return;
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
	}

	window.addEventListener('resize', resizeCanvas);
	resizeCanvas();

	const CONFETTI_COLORS = ['#00f0ff', '#ff007f', '#ffe600', '#39ff14', '#b026ff', '#ffffff'];

	function spawnPixelConfetti(x, y, count) {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		if (!canvas || !ctxCanvas) return;

		const num = count || 40;
		const startX = x !== undefined ? x : window.innerWidth / 2;
		const startY = y !== undefined ? y : window.innerHeight / 2;

		for (let i = 0; i < num; i++) {
			const angle = Math.random() * Math.PI * 2;
			const speed = 3 + Math.random() * 8;
			particles.push({
				x: startX,
				y: startY,
				vx: Math.cos(angle) * speed,
				vy: Math.sin(angle) * speed - 2,
				size: Math.floor(4 + Math.random() * 6),
				color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
				life: 1.0,
				decay: 0.015 + Math.random() * 0.02
			});
		}

		if (!animationFrameId) {
			renderConfetti();
		}
	}

	function renderConfetti() {
		if (!ctxCanvas || !canvas) return;
		ctxCanvas.clearRect(0, 0, canvas.width, canvas.height);

		for (let i = particles.length - 1; i >= 0; i--) {
			const p = particles[i];
			p.x += p.vx;
			p.y += p.vy;
			p.vy += 0.25; // gravity
			p.life -= p.decay;

			if (p.life <= 0 || p.y > canvas.height) {
				particles.splice(i, 1);
				continue;
			}

			ctxCanvas.fillStyle = p.color;
			ctxCanvas.globalAlpha = p.life;
			ctxCanvas.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size);
		}

		ctxCanvas.globalAlpha = 1.0;

		if (particles.length > 0) {
			animationFrameId = requestAnimationFrame(renderConfetti);
		} else {
			animationFrameId = null;
		}
	}

	// =========================================================================
	// DOM ELEMENTS & INITIALIZATION
	// =========================================================================
	document.addEventListener('DOMContentLoaded', function () {
		const cards = Array.from(document.querySelectorAll('.sighting-item .card'));
		const hudCollectedCount = document.getElementById('hud-collected-count');
		const hudTotalCount = document.getElementById('hud-total-count');
		const hudProgressFill = document.getElementById('hud-progress-fill');
		const hudProgressPct = document.getElementById('hud-progress-pct');
		const visibleCountEl = document.getElementById('visible-count');
		const noResultsMsg = document.getElementById('no-results-msg');
		const filterStatusText = document.getElementById('filter-status-text');

		const searchInput = document.getElementById('search-input');
		const countryFilter = document.getElementById('country-filter');
		const collectionFilter = document.getElementById('collection-filter');
		const btnResetFilters = document.getElementById('btn-reset-filters');

		const btnSoundToggle = document.getElementById('btn-sound-toggle');
		const soundIcon = document.getElementById('sound-icon');
		const soundText = document.getElementById('sound-text');

		const btnCrtToggle = document.getElementById('btn-crt-toggle');
		const crtText = document.getElementById('crt-text');

		const modal = document.getElementById('specimen-modal');
		const modalCloseBtn = document.getElementById('modal-close-btn');
		const modalCloseFooterBtn = document.getElementById('modal-close-footer-btn');
		const modalCollectBtn = document.getElementById('modal-collect-btn');
		const modalContent = document.getElementById('modal-content');

		// Sync initial CRT state
		if (!isCrtEnabled) {
			document.body.classList.add('crt-off');
			if (crtText) crtText.textContent = 'CRT OFF';
		}

		// Sync initial SFX state
		function updateSoundUI() {
			if (soundIcon) soundIcon.textContent = isMuted ? '🔇' : '🔊';
			if (soundText) soundText.textContent = isMuted ? 'SFX OFF' : 'SFX ON';
		}
		updateSoundUI();

		// Apply collected state to cards
		function syncCardCollectionState(card) {
			const id = card.dataset.id;
			const isCollected = collectedIds.has(id);
			card.classList.toggle('is-collected', isCollected);

			const btn = card.querySelector('.btn-collect-toggle');
			const indicator = card.querySelector('.card__collect-indicator');
			const icon = btn ? btn.querySelector('.collect-icon') : null;
			const text = btn ? btn.querySelector('.collect-text') : null;

			if (isCollected) {
				if (btn) btn.classList.add('is-collected');
				if (indicator) indicator.textContent = '★ CLAIMED';
				if (icon) icon.textContent = '✓';
				if (text) text.textContent = 'CLAIMED';
			} else {
				if (btn) btn.classList.remove('is-collected');
				if (indicator) indicator.textContent = 'UNCLAIMED';
				if (icon) icon.textContent = '★';
				if (text) text.textContent = 'COLLECT';
			}
		}

		function updateHUD() {
			const total = cards.length;
			let collected = 0;
			cards.forEach(card => {
				if (collectedIds.has(card.dataset.id)) {
					collected++;
				}
			});

			const pct = total > 0 ? Math.round((collected / total) * 100) : 0;

			if (hudCollectedCount) hudCollectedCount.textContent = collected;
			if (hudTotalCount) hudTotalCount.textContent = total;
			if (hudProgressFill) hudProgressFill.style.width = pct + '%';
			if (hudProgressPct) hudProgressPct.textContent = pct + '%';

			if (pct === 100 && total > 0) {
				if (filterStatusText) filterStatusText.textContent = '🏆 MASTER COLLECTOR! 🏆';
			}
		}

		cards.forEach(syncCardCollectionState);
		updateHUD();

		// Toggle Collection Action
		function toggleCollection(card, evt) {
			const id = card.dataset.id;
			if (!id) return;

			if (collectedIds.has(id)) {
				collectedIds.delete(id);
				playUncollectSound();
			} else {
				collectedIds.add(id);
				playCollectSound();
				const rect = evt && evt.target ? evt.target.getBoundingClientRect() : card.getBoundingClientRect();
				spawnPixelConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2, 35);
			}

			saveCollection(card);
		}

		function saveCollection(card) {
			try {
				localStorage.setItem(STORAGE_KEY_COLLECTED, JSON.stringify(Array.from(collectedIds)));
			} catch (e) {
				console.warn('localStorage write error:', e);
			}

			syncCardCollectionState(card);
			updateHUD();
			applyFilters();

			// Sync modal button if open
			if (currentModalCard && currentModalCard.dataset.id === card.dataset.id) {
				updateModalCollectBtn();
			}
		}

		// Event listener for card collection buttons
		document.addEventListener('click', function (e) {
			const collectBtn = e.target.closest('.btn-collect-toggle');
			if (collectBtn) {
				e.preventDefault();
				const card = collectBtn.closest('.card');
				if (card) toggleCollection(card, e);
				return;
			}

			const profileBtn = e.target.closest('.btn-open-modal');
			if (profileBtn) {
				e.preventDefault();
				const card = profileBtn.closest('.card');
				if (card) openSpecimenModal(card);
				return;
			}
		});

		// HUD SFX Toggle
		if (btnSoundToggle) {
			btnSoundToggle.addEventListener('click', function () {
				isMuted = !isMuted;
				localStorage.setItem(STORAGE_KEY_MUTED, isMuted ? 'true' : 'false');
				updateSoundUI();
				if (!isMuted) playBlipSound();
			});
		}

		// HUD CRT Toggle
		if (btnCrtToggle) {
			btnCrtToggle.addEventListener('click', function () {
				isCrtEnabled = !isCrtEnabled;
				localStorage.setItem(STORAGE_KEY_CRT, isCrtEnabled ? 'true' : 'false');
				document.body.classList.toggle('crt-off', !isCrtEnabled);
				if (crtText) crtText.textContent = isCrtEnabled ? 'CRT ON' : 'CRT OFF';
				playBlipSound();
			});
		}

		// =====================================================================
		// FILTERS & SEARCH
		// =====================================================================
		function applyFilters() {
			const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
			const selectedCountry = countryFilter ? countryFilter.value : 'ALL';
			const selectedCollection = collectionFilter ? collectionFilter.value : 'ALL';

			let visibleCount = 0;

			cards.forEach(card => {
				const name = (card.dataset.name || '').toLowerCase();
				const scientific = (card.dataset.scientific || '').toLowerCase();
				const country = (card.dataset.country || '').toLowerCase();
				const locality = (card.dataset.locality || '').toLowerCase();
				const state = (card.dataset.state || '').toLowerCase();
				const kingdom = (card.dataset.kingdom || '').toLowerCase();
				const phylum = (card.dataset.phylum || '').toLowerCase();
				const cls = (card.dataset.class || '').toLowerCase();
				const order = (card.dataset.order || '').toLowerCase();
				const family = (card.dataset.family || '').toLowerCase();
				const cardId = card.dataset.id;
				const isCollected = collectedIds.has(cardId);

				const matchesQuery = !query ||
					name.includes(query) ||
					scientific.includes(query) ||
					country.includes(query) ||
					locality.includes(query) ||
					state.includes(query) ||
					kingdom.includes(query) ||
					phylum.includes(query) ||
					cls.includes(query) ||
					order.includes(query) ||
					family.includes(query);

				const matchesCountry = (selectedCountry === 'ALL') ||
					(card.dataset.country === selectedCountry);

				const matchesCollection = (selectedCollection === 'ALL') ||
					(selectedCollection === 'COLLECTED' && isCollected) ||
					(selectedCollection === 'UNCOLLECTED' && !isCollected);

				const parentLi = card.closest('.sighting-item');
				if (matchesQuery && matchesCountry && matchesCollection) {
					if (parentLi) parentLi.style.display = '';
					visibleCount++;
				} else {
					if (parentLi) parentLi.style.display = 'none';
				}
			});

			if (visibleCountEl) visibleCountEl.textContent = visibleCount;
			if (noResultsMsg) noResultsMsg.style.display = visibleCount === 0 ? 'block' : 'none';

			if (filterStatusText) {
				if (query || selectedCountry !== 'ALL' || selectedCollection !== 'ALL') {
					filterStatusText.textContent = `FILTERED: ${visibleCount} MATCHES`;
				} else {
					filterStatusText.textContent = 'READY PLAYER 1';
				}
			}
		}

		if (searchInput) searchInput.addEventListener('input', applyFilters);
		if (countryFilter) countryFilter.addEventListener('change', function () {
			playBlipSound();
			applyFilters();
		});
		if (collectionFilter) collectionFilter.addEventListener('change', function () {
			playBlipSound();
			applyFilters();
		});

		if (btnResetFilters) {
			btnResetFilters.addEventListener('click', function () {
				playBlipSound();
				if (searchInput) searchInput.value = '';
				if (countryFilter) countryFilter.value = 'ALL';
				if (collectionFilter) collectionFilter.value = 'ALL';
				applyFilters();
			});
		}

		// =====================================================================
		// SPECIMEN DOSSIER MODAL
		// =====================================================================
		function updateModalCollectBtn() {
			if (!modalCollectBtn || !currentModalCard) return;
			const isCollected = collectedIds.has(currentModalCard.dataset.id);
			if (isCollected) {
				modalCollectBtn.textContent = '✓ REMOVE FROM COLLECTION';
				modalCollectBtn.className = 'pixel-btn pixel-btn--warning';
			} else {
				modalCollectBtn.textContent = '★ ADD TO COLLECTION';
				modalCollectBtn.className = 'pixel-btn pixel-btn--primary';
			}
		}

		function openSpecimenModal(card) {
			currentModalCard = card;
			playModalSound();

			const d = card.dataset;
			// Reuse the card's server-rendered carousel so every image is browsable here too.
			const cardCarousel = card.querySelector('.carousel');
			const imgHtml = cardCarousel
				? `<div class="dossier-media">${cardCarousel.outerHTML}</div>`
				: '';

			const refUrlHtml = d.refUrl
				? `<dd><a href="${escapeHtml(d.refUrl)}" target="_blank" rel="noopener noreferrer" class="pixel-link">[OPEN GBIF RECORD ↗]</a></dd>`
				: '<dd>Not available</dd>';

			modalContent.innerHTML = `
				<div class="dossier-header-preview">
					<h3 class="card__title" style="font-size: 20px; color: var(--neon-yellow);">${escapeHtml(d.name)}</h3>
					${d.scientific ? `<p class="card__scientific" style="font-size: 24px;">${escapeHtml(d.scientific)}</p>` : ''}
				</div>

				${imgHtml}

				<div class="dossier-grid">
					<!-- Taxonomy Section -->
					<div class="dossier-section">
						<h4 class="dossier-heading">TAXONOMY LOG</h4>
						<dl class="dossier-dl">
							${d.kingdom ? `<dt>KINGDOM</dt><dd>${escapeHtml(d.kingdom)}</dd>` : ''}
							${d.phylum ? `<dt>PHYLUM</dt><dd>${escapeHtml(d.phylum)}</dd>` : ''}
							${d.class ? `<dt>CLASS</dt><dd>${escapeHtml(d.class)}</dd>` : ''}
							${d.order ? `<dt>ORDER</dt><dd>${escapeHtml(d.order)}</dd>` : ''}
							${d.family ? `<dt>FAMILY</dt><dd>${escapeHtml(d.family)}</dd>` : ''}
							${d.genus ? `<dt>GENUS</dt><dd>${escapeHtml(d.genus)}</dd>` : ''}
						</dl>
					</div>

					<!-- Field Environment & Weather -->
					<div class="dossier-section">
						<h4 class="dossier-heading">ATMOSPHERIC DATA</h4>
						<dl class="dossier-dl">
							<dt>TEMP</dt><dd>${escapeHtml(d.temp || 'N/A')}</dd>
							<dt>WIND</dt><dd>${escapeHtml(d.wind || 'N/A')}</dd>
							<dt>HUMIDITY</dt><dd>${escapeHtml(d.humidity || 'N/A')}</dd>
							<dt>WEATHER</dt><dd>${escapeHtml(d.condition || 'Clear/Recorded')}</dd>
							<dt>ALTITUDE</dt><dd>${escapeHtml(d.elevation || 'Sea level')}</dd>
						</dl>
					</div>

					<!-- Encounter Log -->
					<div class="dossier-section">
						<h4 class="dossier-heading">ENCOUNTER LOG</h4>
						<dl class="dossier-dl">
							<dt>SEEN</dt><dd>${escapeHtml(d.seen || 'Unknown date')}</dd>
							<dt>LOCATION</dt><dd>${escapeHtml(d.place || 'Unknown')}</dd>
							<dt>GPS COORD</dt><dd>${escapeHtml(d.lat)}, ${escapeHtml(d.lon)}</dd>
							<dt>COUNT</dt><dd>${escapeHtml(d.count || '1')}</dd>
						</dl>
					</div>

					<!-- Observer / Source -->
					<div class="dossier-section">
						<h4 class="dossier-heading">FIELD OBSERVER</h4>
						<dl class="dossier-dl">
							<dt>REC BY</dt><dd>${escapeHtml(d.recordedBy || 'GBIF Contributor')}</dd>
							<dt>REMARKS</dt><dd>${escapeHtml(d.remarks || 'None noted')}</dd>
							<dt>REF LINK</dt>${refUrlHtml}
						</dl>
					</div>
				</div>
			`;

			updateModalCollectBtn();
			modalContent.querySelectorAll('[data-carousel]').forEach(c => goToSlide(c, 0, 'instant'));

			if (modal && typeof modal.showModal === 'function') {
				modal.showModal();
			} else if (modal) {
				modal.setAttribute('open', '');
			}
		}

		function closeModal() {
			playBlipSound();
			if (modal && typeof modal.close === 'function') {
				modal.close();
			} else if (modal) {
				modal.removeAttribute('open');
			}
			currentModalCard = null;
		}

		if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
		if (modalCloseFooterBtn) modalCloseFooterBtn.addEventListener('click', closeModal);

		if (modalCollectBtn) {
			modalCollectBtn.addEventListener('click', function (e) {
				if (currentModalCard) {
					toggleCollection(currentModalCard, e);
				}
			});
		}

		if (modal) {
			modal.addEventListener('click', function (e) {
				if (e.target === modal) {
					closeModal();
				}
			});
			modal.addEventListener('cancel', function () {
				currentModalCard = null;
			});
		}

		// =====================================================================
		// MEDIA CAROUSEL
		// =====================================================================
		const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		function carouselTrack(c) {
			return c.querySelector('.carousel__track');
		}

		function currentSlide(c) {
			const track = carouselTrack(c);
			return track.clientWidth ? Math.round(track.scrollLeft / track.clientWidth) : 0;
		}

		function updateCarouselUI(c, idx) {
			const total = c.querySelectorAll('.carousel__slide').length;
			const counter = c.querySelector('[data-carousel-counter]');
			if (counter) counter.textContent = (idx + 1) + '/' + total;

			const thumbs = c.querySelectorAll('[data-carousel-goto]');
			thumbs.forEach((t, i) => {
				t.classList.toggle('is-active', i === idx);
				t.setAttribute('aria-current', i === idx ? 'true' : 'false');
			});

			// Keep the active thumbnail in view without scrolling the page.
			const strip = c.querySelector('.carousel__thumbs');
			const active = thumbs[idx];
			if (strip && active) {
				strip.scrollLeft = active.offsetLeft - strip.clientWidth / 2 + active.offsetWidth / 2;
			}
		}

		function goToSlide(c, idx, behavior) {
			const total = c.querySelectorAll('.carousel__slide').length;
			if (!total) return;
			idx = (idx + total) % total; // wrap around both ends
			updateCarouselUI(c, idx);
			const track = carouselTrack(c);
			track.scrollTo({
				left: idx * track.clientWidth,
				behavior: behavior || (prefersReducedMotion ? 'instant' : 'smooth')
			});
		}

		document.addEventListener('click', function (e) {
			const btn = e.target.closest('[data-carousel-prev], [data-carousel-next], [data-carousel-goto]');
			if (!btn) return;
			const c = btn.closest('[data-carousel]');
			if (!c) return;
			e.preventDefault();
			playBlipSound();

			const cur = currentSlide(c);
			if (btn.hasAttribute('data-carousel-prev')) goToSlide(c, cur - 1);
			else if (btn.hasAttribute('data-carousel-next')) goToSlide(c, cur + 1);
			else goToSlide(c, Number(btn.dataset.carouselGoto));
		});

		// Swipes and arrow keys scroll the track natively; sync the UI once it settles.
		// Scroll events don't bubble, so listen in the capture phase.
		let carouselScrollTimer = null;
		document.addEventListener('scroll', function (e) {
			const track = e.target;
			if (!track.classList || !track.classList.contains('carousel__track')) return;
			clearTimeout(carouselScrollTimer);
			carouselScrollTimer = setTimeout(function () {
				const c = track.closest('[data-carousel]');
				if (c) updateCarouselUI(c, currentSlide(c));
			}, 90);
		}, true);

		// =====================================================================
		// GUESS THE CRITTER // QUIZ MINI-GAME
		// =====================================================================
		const QUIZ_ROUNDS = 10;
		const QUIZ_LIVES = 3;
		const QUIZ_SECONDS = 15;
		const QUIZ_REVEAL_SECONDS = 9; // picture goes from chunky pixels to sharp over this time
		const PIXEL_LEVELS = [40, 28, 20, 14, 10, 7, 5, 3, 2, 1];

		const quizModal = document.getElementById('quiz-modal');
		const quizScreens = {
			start: document.getElementById('quiz-start'),
			play: document.getElementById('quiz-play'),
			over: document.getElementById('quiz-over')
		};
		const quizEls = {
			hiscore: document.getElementById('quiz-hiscore'),
			round: document.getElementById('quiz-round'),
			rounds: document.getElementById('quiz-rounds'),
			lives: document.getElementById('quiz-lives'),
			score: document.getElementById('quiz-score'),
			timerFill: document.getElementById('quiz-timer-fill'),
			question: document.getElementById('quiz-question'),
			picture: document.getElementById('quiz-picture'),
			options: document.getElementById('quiz-options'),
			feedback: document.getElementById('quiz-feedback'),
			overTitle: document.getElementById('quiz-over-title'),
			finalScore: document.getElementById('quiz-final-score'),
			finalCorrect: document.getElementById('quiz-final-correct'),
			finalStreak: document.getElementById('quiz-final-streak'),
			finalCaught: document.getElementById('quiz-final-caught'),
			newHi: document.getElementById('quiz-newhi')
		};

		const quizPool = cards.map(card => ({
			card: card,
			id: card.dataset.id,
			name: card.dataset.name || '',
			scientific: card.dataset.scientific || '',
			country: card.dataset.country || '',
			cls: card.dataset.class || '',
			images: Array.from(card.querySelectorAll('.carousel__slide .gallery__img'))
				.map(img => img.getAttribute('src'))
				.filter(Boolean)
		}));

		function uniq(values) {
			return Array.from(new Set(values.filter(Boolean)));
		}

		function shuffle(arr) {
			const a = arr.slice();
			for (let i = a.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[a[i], a[j]] = [a[j], a[i]];
			}
			return a;
		}

		function pick(arr) {
			return arr[Math.floor(Math.random() * arr.length)];
		}

		const quizNames = uniq(quizPool.map(e => e.name));
		const quizCountries = uniq(quizPool.map(e => e.country));
		const quizClasses = uniq(quizPool.map(e => e.cls));

		function makeOptions(answer, choices) {
			const wrong = shuffle(choices.filter(v => v !== answer)).slice(0, 3);
			return shuffle(wrong.concat(answer));
		}

		function buildQuestion(entry) {
			const types = [];
			if (quizNames.length >= 2) {
				// Picture rounds are the main event, so weight them up.
				if (entry.images.length) types.push('name', 'name', 'name');
				else if (entry.scientific && entry.scientific !== entry.name) types.push('sci');
			}
			if (entry.country && quizCountries.length >= 2) types.push('country');
			if (entry.cls && quizClasses.length >= 2) types.push('class');
			if (!types.length) return null;

			const label = entry.name.toUpperCase();
			switch (pick(types)) {
				case 'name':
					return { entry, pixelate: true, image: pick(entry.images), prompt: 'WHO IS THIS CRITTER?', answer: entry.name, options: makeOptions(entry.name, quizNames) };
				case 'sci':
					return { entry, prompt: `WHICH CRITTER GOES BY "${entry.scientific}"?`, answer: entry.name, options: makeOptions(entry.name, quizNames) };
				case 'country':
					return { entry, image: entry.images[0], prompt: `WHERE WAS THIS ${label} SPOTTED?`, answer: entry.country, options: makeOptions(entry.country, quizCountries) };
				default:
					return { entry, image: entry.images[0], prompt: `WHICH CLASS DOES THE ${label} BELONG TO?`, answer: entry.cls, options: makeOptions(entry.cls, quizClasses) };
			}
		}

		function buildQuestions() {
			const order = shuffle(quizPool);
			const questions = [];
			for (let i = 0; questions.length < QUIZ_ROUNDS && i < order.length * 3; i++) {
				const q = buildQuestion(order[i % order.length]);
				if (q) questions.push(q);
			}
			return questions;
		}

		function getHiScore() {
			return Number(localStorage.getItem(STORAGE_KEY_HISCORE)) || 0;
		}

		let quiz = null;

		function showQuizScreen(name) {
			Object.entries(quizScreens).forEach(([key, el]) => {
				if (el) el.hidden = key !== name;
			});
		}

		function stopQuizTimers() {
			if (!quiz) return;
			cancelAnimationFrame(quiz.raf);
			clearTimeout(quiz.nextTimer);
			clearTimeout(quiz.loadTimer);
		}

		function renderLives() {
			const lost = QUIZ_LIVES - quiz.lives;
			quizEls.lives.textContent = '♥'.repeat(quiz.lives) + '♡'.repeat(lost);
			quizEls.lives.setAttribute('aria-label', quiz.lives + ' lives left');
		}

		function openQuiz() {
			if (!quizModal) return;
			playModalSound();
			quizEls.hiscore.textContent = getHiScore();
			showQuizScreen('start');
			if (typeof quizModal.showModal === 'function') quizModal.showModal();
			else quizModal.setAttribute('open', '');
			document.getElementById('quiz-start-btn').focus();
		}

		function closeQuiz() {
			stopQuizTimers();
			if (quizModal && typeof quizModal.close === 'function') quizModal.close();
			else if (quizModal) quizModal.removeAttribute('open');
		}

		function startQuiz() {
			stopQuizTimers();
			const questions = buildQuestions();
			if (!questions.length) return;
			quiz = { questions, round: 0, score: 0, lives: QUIZ_LIVES, streak: 0, bestStreak: 0, correct: 0, caught: 0 };
			quizEls.rounds.textContent = questions.length;
			quizEls.score.textContent = '0';
			renderLives();
			showQuizScreen('play');
			playStartSound();
			renderQuestion();
		}

		// Draw the picture at 1/block resolution and scale it up with smoothing off.
		function drawPicture(block) {
			const img = quiz.img;
			const canvas = quiz.canvas;
			if (!img || !canvas || !img.naturalWidth) return;
			const W = canvas.width;
			const H = canvas.height;
			const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
			const sw = W / scale;
			const sh = H / scale;
			const sx = (img.naturalWidth - sw) / 2;
			const sy = (img.naturalHeight - sh) / 2;
			const w = Math.max(1, Math.ceil(W / block));
			const h = Math.max(1, Math.ceil(H / block));

			const off = quiz.offscreen;
			off.width = w;
			off.height = h;
			off.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, w, h);

			const ctx = canvas.getContext('2d');
			ctx.imageSmoothingEnabled = false;
			ctx.clearRect(0, 0, W, H);
			ctx.drawImage(off, 0, 0, w, h, 0, 0, W, H);
			quiz.block = block;
		}

		function renderQuestion() {
			const q = quiz.questions[quiz.round];
			quiz.locked = true; // until the picture (if any) is ready
			quiz.answered = false;
			quiz.lastWhole = null;
			quiz.timeLeft = QUIZ_SECONDS;
			quiz.img = null;
			quiz.canvas = null;
			quiz.block = null;

			quizEls.round.textContent = quiz.round + 1;
			quizEls.question.textContent = q.prompt;
			quizEls.feedback.textContent = '';
			quizEls.feedback.className = 'quiz-feedback';
			quizEls.timerFill.style.width = '100%';
			quizEls.timerFill.classList.remove('is-low');

			quizEls.options.innerHTML = '';
			q.options.forEach((opt, i) => {
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'pixel-btn quiz-option';
				btn.dataset.value = opt;
				const key = document.createElement('span');
				key.className = 'quiz-option__key';
				key.textContent = i + 1;
				const text = document.createElement('span');
				text.textContent = opt;
				btn.append(key, text);
				btn.addEventListener('click', () => answerQuiz(opt, btn));
				quizEls.options.appendChild(btn);
			});

			quizEls.picture.innerHTML = '';
			quizEls.picture.hidden = !q.image;
			if (!q.image) {
				beginRound();
				return;
			}

			const canvas = document.createElement('canvas');
			canvas.width = 480;
			canvas.height = 320;
			canvas.className = 'quiz-picture__canvas';
			canvas.setAttribute('role', 'img');
			canvas.setAttribute('aria-label', 'Mystery critter');
			const loading = document.createElement('p');
			loading.className = 'quiz-picture__msg blink';
			loading.textContent = 'LOADING…';
			quizEls.picture.append(canvas, loading);

			// Remote images can be slow, so prefer one the page has already downloaded.
			if (q.pixelate) {
				const loaded = Array.from(q.entry.card.querySelectorAll('.gallery__img'))
					.filter(i => i.complete && i.naturalWidth > 0)
					.map(i => i.getAttribute('src'));
				if (loaded.length && !loaded.includes(q.image)) q.image = pick(loaded);
			}

			const next = quiz.questions[quiz.round + 1];
			if (next && next.image) new Image().src = next.image;

			const img = new Image();
			const round = quiz.round;
			let started = false;
			const isCurrent = () => quizModal.open && quiz.round === round && !quiz.answered;
			const start = function () {
				if (started) return;
				started = true;
				clearTimeout(quiz.loadTimer);
				beginRound();
			};
			img.onload = function () {
				// May arrive after the wait below gave up; show it anyway.
				if (!isCurrent()) return;
				loading.remove();
				quiz.img = img;
				quiz.canvas = canvas;
				quiz.offscreen = quiz.offscreen || document.createElement('canvas');
				drawPicture(q.pixelate ? PIXEL_LEVELS[0] : 1);
				start();
			};
			img.onerror = function () {
				if (!isCurrent()) return;
				loading.classList.remove('blink');
				loading.textContent = q.entry.scientific
					? '📡 SIGNAL LOST // HINT: ' + q.entry.scientific
					: '📡 SIGNAL LOST';
				start();
			};
			quiz.loadTimer = setTimeout(start, 5000);
			img.src = q.image;
		}

		function beginRound() {
			quiz.locked = false;
			quiz.startedAt = performance.now();
			quiz.raf = requestAnimationFrame(quizTick);
		}

		function quizTick(now) {
			if (!quiz || quiz.locked) return;
			const q = quiz.questions[quiz.round];
			const elapsed = (now - quiz.startedAt) / 1000;
			const left = Math.max(0, QUIZ_SECONDS - elapsed);
			quiz.timeLeft = left;

			quizEls.timerFill.style.width = (left / QUIZ_SECONDS * 100) + '%';
			quizEls.timerFill.classList.toggle('is-low', left < 4);

			const whole = Math.ceil(left);
			if (whole !== quiz.lastWhole) {
				quiz.lastWhole = whole;
				if (whole > 0 && whole <= 3) playTickSound();
			}

			if (q.pixelate && quiz.img) {
				const progress = Math.min(1, elapsed / QUIZ_REVEAL_SECONDS);
				const block = PIXEL_LEVELS[Math.min(PIXEL_LEVELS.length - 1, Math.floor(progress * PIXEL_LEVELS.length))];
				if (block !== quiz.block) drawPicture(block);
			}

			if (left <= 0) {
				answerQuiz(null, null);
				return;
			}
			quiz.raf = requestAnimationFrame(quizTick);
		}

		function answerQuiz(choice, btn) {
			if (!quiz || quiz.locked) return;
			quiz.locked = true;
			quiz.answered = true;
			cancelAnimationFrame(quiz.raf);

			const q = quiz.questions[quiz.round];
			const ok = choice === q.answer;

			quizEls.options.querySelectorAll('.quiz-option').forEach(b => {
				b.disabled = true;
				if (b.dataset.value === q.answer) b.classList.add('is-correct');
				else if (b === btn) b.classList.add('is-wrong');
			});
			if (quiz.img) drawPicture(1);

			let msg;
			if (ok) {
				quiz.correct++;
				quiz.streak++;
				quiz.bestStreak = Math.max(quiz.bestStreak, quiz.streak);
				const mult = Math.min(quiz.streak, 4);
				const points = (100 + Math.round((quiz.timeLeft || 0) * 10)) * mult;
				quiz.score += points;
				quizEls.score.textContent = quiz.score;
				msg = `+${points}` + (mult > 1 ? ` // x${mult} COMBO` : '');

				const card = q.entry.card;
				if (!collectedIds.has(q.entry.id)) {
					collectedIds.add(q.entry.id);
					quiz.caught++;
					saveCollection(card);
					msg += ' // ★ CAUGHT!';
				}
				playCollectSound();
				const rect = btn.getBoundingClientRect();
				spawnPixelConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2, 30);
			} else {
				quiz.streak = 0;
				quiz.lives--;
				renderLives();
				msg = (choice === null ? 'TIME UP!' : 'MISS!') + ` IT WAS ${q.answer.toUpperCase()}`;
				playWrongSound();
				const inner = quizModal.querySelector('.pixel-modal__inner');
				inner.classList.remove('is-shaking');
				void inner.offsetWidth; // restart the animation
				inner.classList.add('is-shaking');
			}

			quizEls.feedback.textContent = msg;
			quizEls.feedback.classList.add(ok ? 'is-correct' : 'is-wrong');

			quiz.nextTimer = setTimeout(nextQuizRound, ok ? 1200 : 2000);
		}

		function nextQuizRound() {
			quiz.round++;
			if (quiz.lives <= 0 || quiz.round >= quiz.questions.length) {
				endQuiz();
				return;
			}
			renderQuestion();
		}

		function endQuiz() {
			const prevHi = getHiScore();
			const isNewHi = quiz.score > prevHi;
			if (isNewHi) localStorage.setItem(STORAGE_KEY_HISCORE, String(quiz.score));

			quizEls.overTitle.textContent = quiz.lives > 0 ? 'STAGE CLEAR!' : 'GAME OVER';
			quizEls.finalScore.textContent = quiz.score;
			quizEls.finalCorrect.textContent = quiz.correct + ' / ' + quiz.questions.length;
			quizEls.finalStreak.textContent = quiz.bestStreak;
			quizEls.finalCaught.textContent = quiz.caught;
			quizEls.newHi.hidden = !isNewHi;
			showQuizScreen('over');
			document.getElementById('quiz-again-btn').focus();

			if (quiz.lives > 0 || isNewHi) {
				playCollectSound();
				spawnPixelConfetti(window.innerWidth / 2, window.innerHeight / 3, 80);
			} else {
				playGameOverSound();
			}
		}

		document.querySelectorAll('.btn-open-quiz').forEach(b => b.addEventListener('click', openQuiz));
		const quizStartBtn = document.getElementById('quiz-start-btn');
		const quizAgainBtn = document.getElementById('quiz-again-btn');
		const quizCloseBtn = document.getElementById('quiz-close-btn');
		if (quizStartBtn) quizStartBtn.addEventListener('click', startQuiz);
		if (quizAgainBtn) quizAgainBtn.addEventListener('click', startQuiz);
		if (quizCloseBtn) quizCloseBtn.addEventListener('click', closeQuiz);

		if (quizModal) {
			// Fires for ESC as well as closeQuiz().
			quizModal.addEventListener('close', stopQuizTimers);
			quizModal.addEventListener('click', function (e) {
				if (e.target === quizModal) closeQuiz();
			});
			quizModal.addEventListener('keydown', function (e) {
				if (quizScreens.play.hidden || !/^[1-4]$/.test(e.key)) return;
				const btn = quizEls.options.querySelectorAll('.quiz-option')[Number(e.key) - 1];
				if (btn && !btn.disabled) btn.click();
			});
		}

		function escapeHtml(str) {
			if (!str) return '';
			return str
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#039;');
		}
	});
})();
