// M310 Land Works — minimal vanilla JS
(function () {
  // Mobile nav toggle
  var burger = document.getElementById('navToggle');
  var menu = document.getElementById('mobileMenu');
  if (burger && menu) {
    burger.addEventListener('click', function () {
      var open = menu.classList.toggle('hidden') === false;
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Header shadow on scroll
  var header = document.getElementById('siteHeader');
  if (header) {
    var onScroll = function () {
      if (window.scrollY > 8) header.classList.add('shadow-lg');
      else header.classList.remove('shadow-lg');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Capture UTM params into hidden lead-form fields (Meta Ads tracking)
  try {
    var params = new URLSearchParams(window.location.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) {
      var v = params.get(k) || '';
      document.querySelectorAll('input[name="' + k + '"]').forEach(function (el) { el.value = v; });
    });
  } catch (e) {}

  // Lead form submit — POST actual lead data to /api/lead and show success UI.
  document.querySelectorAll('form[data-lead-form]').forEach(function (form) {
    // Stamp when the form became available. The API compares this against
    // arrival time; sub-two-second fills get flagged as likely bots.
    var stamp = form.querySelector('input[name="form_render_ts"]');
    if (stamp) { stamp.value = String(Date.now()); }

    var sending = false;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (sending) return;

      var success = form.parentElement.querySelector('[data-form-success]');
      var errorBox = form.querySelector('[data-form-error]');
      var submitButton = form.querySelector('[type="submit"]');
      var originalLabel = submitButton ? submitButton.textContent : '';

      sending = true;
      if (errorBox) { errorBox.classList.add('hidden'); }
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Sending…';
      }

      var payload = { page: window.location.pathname };
      var formData = new FormData(form);
      formData.forEach(function (value, key) {
        payload[key] = value;
      });

      fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            if (!res.ok) throw new Error(data.error || 'Submission failed.');
            return data;
          });
        })
        .then(function () {
          if (typeof fbq === 'function') { fbq('track', 'Lead'); }
          form.classList.add('hidden');
          if (success) {
            success.classList.remove('hidden');
            success.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        })
        .catch(function (err) {
          console.error('Lead submit error:', err);
          if (errorBox) {
            errorBox.textContent = err.message + ' You can also call (803) 989-0031.';
            errorBox.classList.remove('hidden');
          } else {
            alert('Sorry, there was a problem sending your request. Please try again or call us directly.');
          }
          // A Turnstile token is single-use and the failed attempt just spent it.
          // Without this reset a retry would always fail the check.
          if (window.turnstile) {
            try { window.turnstile.reset(form.querySelector('.cf-turnstile')); } catch (e) {}
          }
        })
        .finally(function () {
          sending = false;
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = originalLabel;
          }
        });
    });
  });

  // "Get Quote" scroll-to-form buttons
  document.querySelectorAll('[data-scroll-to]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      var target = document.querySelector(btn.getAttribute('data-scroll-to'));
      if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });
})();
