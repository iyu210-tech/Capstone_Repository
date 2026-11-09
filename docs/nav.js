/* Bottom navigation for phones.
 *
 * The bar sits within thumb reach and stays reachable from halfway down a long
 * lesson. app.js marks the current tab (it owns every [data-nav] link), so all
 * that is left here is the account tab.
 *
 * It is display:none above 860px, where the header has room to do its job.
 */
(function () {
  "use strict";

  var btn = document.getElementById("mnav-account");
  if (!btn) return;

  // The header button is the one auth.js owns; clicking it here keeps a single
  // implementation rather than a second copy of the sign-in logic.
  btn.addEventListener("click", function () {
    var b = document.querySelector("#account button");
    if (b) b.click();
  });
}());
