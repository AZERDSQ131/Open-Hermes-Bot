/*
 * Grok Bot, project site.
 *
 * The avatars are drawn from the same frames the desktop app draws, so the
 * site and the app never drift apart.
 */
(function () {
  'use strict';

  var FRAMES = window.BLOUB_FRAMES;
  var EYE_PAPER = '#f6f3e9';

  var GROUP_LAYOUT_3 = [
    { top: '0%', left: '9%', scale: 0.64 },
    { bottom: '0%', left: '0%', scale: 0.57 },
    { bottom: '2%', right: '0%', scale: 0.53 }
  ];
  var GROUP_LAYOUT_2 = [
    { top: '0%', left: '5%', scale: 0.68 },
    { bottom: '0%', right: '1%', scale: 0.6 }
  ];

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  var uid = 0;
  var timers = [];

  function bloubSvg(shape, color, variant) {
    var data = FRAMES[shape] || FRAMES.cercle;
    var frame = data.variants[variant] || data.variants.neutral;
    var viewBox = data.viewBox;
    var maskId = 'bloub-mask-' + ++uid;
    var eyes = frame.eyes
      .map(function (eye) {
        return (
          '<path d="' +
          eye.d +
          '" transform="' +
          eye.matrix +
          '" opacity="' +
          eye.alpha +
          '" fill="#000"/>'
        );
      })
      .join('');

    return (
      '<svg viewBox="' +
      -viewBox +
      ' ' +
      -viewBox +
      ' ' +
      viewBox * 2 +
      ' ' +
      viewBox * 2 +
      '" aria-hidden="true" focusable="false">' +
      '<defs><mask id="' +
      maskId +
      '" maskUnits="userSpaceOnUse" x="' +
      -viewBox +
      '" y="' +
      -viewBox +
      '" width="' +
      viewBox * 2 +
      '" height="' +
      viewBox * 2 +
      '">' +
      '<path d="' +
      frame.bodyPath +
      '" fill="#fff"/>' +
      eyes +
      '</mask></defs>' +
      '<path d="' +
      frame.bodyPath +
      '" fill="' +
      EYE_PAPER +
      '"/>' +
      '<g mask="url(#' +
      maskId +
      ')"><rect x="' +
      -viewBox +
      '" y="' +
      -viewBox +
      '" width="' +
      viewBox * 2 +
      '" height="' +
      viewBox * 2 +
      '" fill="' +
      color +
      '"/></g></svg>'
    );
  }

  /* Draws one avatar into a host element. */
  function paint(el, shape, color, variant) {
    el.innerHTML = bloubSvg(shape, color, variant || 'neutral');
  }

  /* A group avatar: up to three faces, the way the app stacks them. */
  function paintGroup(el, members, size) {
    var visible = members.slice(0, 3);
    var extra = members.length - visible.length;
    var layout = visible.length > 2 ? GROUP_LAYOUT_3 : GROUP_LAYOUT_2;

    var html = visible
      .map(function (member, index) {
        var place = layout[index];
        return (
          '<span class="bloub-group-item" style="width:' +
          place.scale * 100 +
          '%;height:' +
          place.scale * 100 +
          '%;' +
          (place.top ? 'top:' + place.top + ';' : '') +
          (place.bottom ? 'bottom:' + place.bottom + ';' : '') +
          (place.left ? 'left:' + place.left + ';' : '') +
          (place.right ? 'right:' + place.right + ';' : '') +
          '">' +
          bloubSvg(member.shape, member.color, 'neutral') +
          '</span>'
        );
      })
      .join('');

    if (extra > 0 && size >= 32) {
      var countSize = Math.max(14, Math.round(size * 0.3));
      html +=
        '<span class="bloub-group-more" style="height:' +
        countSize +
        'px;min-width:' +
        countSize +
        'px;font-size:' +
        Math.max(8, Math.round(countSize * 0.62)) +
        'px;">+' +
        extra +
        '</span>';
    }

    el.innerHTML = html;
  }

  /* The app's own timeline: idle, wink, wide, idle. */
  var TIMELINE = [
    { variant: 'neutral', duration: 2800 },
    { variant: 'wink', duration: 1300 },
    { variant: 'wide', duration: 1500 },
    { variant: 'neutral', duration: 3000 }
  ];

  function animate(el, shape) {
    if (el.bloubTimer) {
      window.clearTimeout(el.bloubTimer);
      el.bloubTimer = 0;
    }

    var step = 0;

    function tick() {
      if (reduced.matches) return;
      var frame = TIMELINE[step];
      paint(el, shape, el.dataset.color, frame.variant);
      step = (step + 1) % TIMELINE.length;
      el.bloubTimer = window.setTimeout(tick, frame.duration);
      timers.push(el.bloubTimer);
    }

    tick();
  }

  function renderAll(root) {
    var hosts = (root || document).querySelectorAll('.bloub');

    Array.prototype.forEach.call(hosts, function (el) {
      var size = parseInt(el.dataset.size || '40', 10);
      el.style.width = size + 'px';
      el.style.height = size + 'px';

      if (el.dataset.group) {
        var members = el.dataset.group.split('|').map(function (entry) {
          var parts = entry.split(':');
          return { shape: parts[0], color: parts[1] };
        });
        el.classList.add('bloub-group');
        paintGroup(el, members, size);
        return;
      }

      var shape = el.dataset.shape || 'cercle';
      var color = el.dataset.color || '#7a5bc2';
      paint(el, shape, color, 'neutral');

      if (el.classList.contains('is-large')) {
        animate(el, shape);
      }
    });
  }

  /* -------------------------------------------------------------- reveal */

  function setupReveal() {
    var items = document.querySelectorAll('[data-reveal]');

    if (reduced.matches || !('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(items, function (el) {
        el.classList.add('is-in');
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          /* Anything on screen, and anything already scrolled past, is shown.
             A jump to an anchor would otherwise leave the sections in between
             blank. */
          if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
            entry.target.classList.add('is-in');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px 10% 0px', threshold: 0 }
    );

    Array.prototype.forEach.call(items, function (el) {
      el.style.setProperty('--reveal-delay', el.dataset.revealDelay || '0');
      observer.observe(el);
    });
  }

  /* ----------------------------------------------------------- the faces */

  var SHAPES = [
    { id: 'cercle', label: 'Circle' },
    { id: 'galet', label: 'Pebble' },
    { id: 'squircle', label: 'Squircle' },
    { id: 'capsule', label: 'Capsule' },
    { id: 'triangle', label: 'Triangle' },
    { id: 'hexagone', label: 'Hexagon' },
    { id: 'nuage', label: 'Cloud' },
    { id: 'goutte', label: 'Drop' }
  ];

  var COLORS = [
    { name: 'Teal', hex: '#4f9d8f' },
    { name: 'Turquoise', hex: '#2fbfa0' },
    { name: 'Blue', hex: '#3f6fd1' },
    { name: 'Indigo', hex: '#5b5bda' },
    { name: 'Violet', hex: '#7a5bc2' },
    { name: 'Pink', hex: '#e152b0' },
    { name: 'Red', hex: '#e8483f' },
    { name: 'Orange', hex: '#e09248' },
    { name: 'Amber', hex: '#e0b34e' },
    { name: 'Green', hex: '#3ecf8e' },
    { name: 'Gray', hex: '#9a9aa2' },
    { name: 'Ink', hex: '#2b2b31' }
  ];

  function setupFaces() {
    var preview = document.getElementById('face-preview');
    var shapeGrid = document.getElementById('shape-grid');
    var colorGrid = document.getElementById('color-grid');
    if (!preview || !shapeGrid || !colorGrid) return;

    var state = {
      shape: preview.dataset.shape || 'capsule',
      color: preview.dataset.color || '#4f9d8f'
    };

    function label() {
      var shape = SHAPES.filter(function (item) {
        return item.id === state.shape;
      })[0];
      var color = COLORS.filter(function (item) {
        return item.hex === state.color;
      })[0];
      return (shape ? shape.label : state.shape) + ', ' + (color ? color.name : state.color);
    }

    function refresh() {
      preview.dataset.shape = state.shape;
      preview.dataset.color = state.color;
      paint(preview, state.shape, state.color, 'neutral');
      animate(preview, state.shape);

      var caption = document.getElementById('face-name');
      if (caption) caption.textContent = label();
    }

    SHAPES.forEach(function (shape) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'shape-button';
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(state.shape === shape.id));
      button.setAttribute('aria-label', shape.label);
      button.dataset.shape = shape.id;
      button.innerHTML = '<span class="bloub" data-shape="' + shape.id + '" data-color="#8b8b93"></span>';
      shapeGrid.appendChild(button);
    });

    COLORS.forEach(function (color) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'color-button';
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(state.color === color.hex));
      button.setAttribute('aria-label', color.name);
      button.title = color.name;
      button.style.background = color.hex;
      button.dataset.color = color.hex;
      colorGrid.appendChild(button);
    });

    shapeGrid.addEventListener('click', function (event) {
      var button = event.target.closest('.shape-button');
      if (!button) return;
      state.shape = button.dataset.shape;
      Array.prototype.forEach.call(shapeGrid.children, function (child) {
        child.setAttribute('aria-checked', String(child === button));
      });
      refresh();
    });

    colorGrid.addEventListener('click', function (event) {
      var button = event.target.closest('.color-button');
      if (!button) return;
      state.color = button.dataset.color;
      Array.prototype.forEach.call(colorGrid.children, function (child) {
        child.setAttribute('aria-checked', String(child === button));
      });
      refresh();
    });

    renderAll(shapeGrid);
    renderAll(colorGrid);
  }

  /* ---------------------------------------------------------------- nav */

  function setupNav() {
    var nav = document.querySelector('.nav');
    if (!nav) return;

    function onScroll() {
      nav.classList.toggle('is-stuck', window.scrollY > 8);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* --------------------------------------------------------------- boot */

  function boot() {
    renderAll(document);
    setupReveal();
    setupFaces();
    setupNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.addEventListener('beforeunload', function () {
    timers.forEach(function (id) {
      window.clearTimeout(id);
    });
  });
})();
