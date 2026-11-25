/**
 * @file
 * License Manager Pro — copy license key to clipboard.
 */

(function (Drupal) {
  'use strict';

  Drupal.behaviors.licensemanagerproCopy = {
    attach: function (context) {
      var buttons = context.querySelectorAll
        ? context.querySelectorAll('[data-lmp-copy]:not([data-lmp-copy-bound])')
        : [];
      buttons.forEach(function (button) {
        button.setAttribute('data-lmp-copy-bound', 'true');
        button.addEventListener('click', function () {
          var key = button.getAttribute('data-lmp-copy') || '';
          var done = function () {
            var original = button.textContent;
            button.textContent = Drupal.t('Copied');
            window.setTimeout(function () {
              button.textContent = original;
            }, 1500);
          };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(key).then(done, function () {
              fallbackCopy(key);
              done();
            });
          }
          else {
            fallbackCopy(key);
            done();
          }
        });
      });

      function fallbackCopy(text) {
        var area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'absolute';
        area.style.left = '-9999px';
        document.body.appendChild(area);
        area.select();
        try {
          document.execCommand('copy');
        }
        catch (e) {
          // Clipboard unavailable; the key remains visible for manual copy.
        }
        document.body.removeChild(area);
      }
    }
  };
})(Drupal);
