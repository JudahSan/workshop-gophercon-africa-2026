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

			try {
				localStorage.setItem(STORAGE_KEY_COLLECTED, JSON.stringify(Array.from(collectedIds)));
			} catch (e) {
				console.warn('localStorage write error:', e);
			}

			syncCardCollectionState(card);
			updateHUD();
			applyFilters();

			// Sync modal button if open
			if (currentModalCard && currentModalCard.dataset.id === id) {
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
			const imgHtml = d.imageUrl
				? `<div class="dossier-media">
					<img src="${escapeHtml(d.imageUrl)}" alt="${escapeHtml(d.name)}" class="dossier-img"/>
					${d.imageCreator ? `<div class="gallery__credit">CREDIT: ${escapeHtml(d.imageCreator)}</div>` : ''}
				   </div>`
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
