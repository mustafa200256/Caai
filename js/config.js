/* Site configuration — edit here, no need to touch the other scripts. */
window.MH_CONFIG = {
  /*
   * Launch date for the countdown.
   * Keep it null until a REAL date is decided: the page then shows "COMING SOON".
   * Example when ready: "2026-12-01T20:00:00+03:00"
   */
  launchDate: null,

  audio: {
    src: "public/audio/requiem.mp3", // the uploaded file, served from this project only
    title: "Requiem",                // shown in the player pill (also edit index.html)
    targetVolume: 0.6,               // 0..1 (60%)
    fadeInMs: 2400,
    fadeOutMs: 900
  }
};
