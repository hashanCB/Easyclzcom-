// Cookie banner
(function () {
  var cookieOkBtn = document.getElementById('cookieOkBtn');
  var banner = document.getElementById('cookieBanner');
  if (banner) {
    var cookieSession = sessionStorage.getItem('easyclzCookie');
    banner.style.visibility = cookieSession ? 'hidden' : 'visible';
  }
  if (cookieOkBtn) {
    cookieOkBtn.addEventListener('click', function () {
      sessionStorage.setItem('easyclzCookie', 'true');
      if (banner) banner.style.visibility = 'hidden';
    });
  }
})();

// Feature tabs switching (desktop)
var showBlurryBg = function () {
  var blurryBg = document.getElementById('blurry-bg');
  var headerBg = document.getElementById('header-bg');
  if (blurryBg) blurryBg.classList.add('scale-y-100', 'opacity-100');
  if (headerBg) headerBg.classList.add('scale-y-100', 'opacity-100');
};

var hideBlurryBg = function () {
  var blurryBg = document.getElementById('blurry-bg');
  var headerBg = document.getElementById('header-bg');
  if (blurryBg) blurryBg.classList.remove('scale-y-100', 'opacity-100');
  if (headerBg) headerBg.classList.remove('scale-y-100', 'opacity-100');
};

// Mobile accordion toggle
var toggleAccordion = function (section) {
  var item = document.querySelector('[data-accordion="' + section + '"]');
  if (!item) return;
  item.parentElement.querySelectorAll('.header-mobile-menu.expanded').forEach(function (sibling) {
    if (sibling !== item) sibling.classList.remove('expanded');
  });
  item.classList.toggle('expanded');
};

// FAQ details — only one open at a time
document.addEventListener('DOMContentLoaded', function () {
  var details = document.querySelectorAll('details');
  details.forEach(function (targetDetail) {
    targetDetail.addEventListener('click', function () {
      details.forEach(function (detail) {
        if (detail !== targetDetail) {
          detail.removeAttribute('open');
        }
      });
    });
  });
});
