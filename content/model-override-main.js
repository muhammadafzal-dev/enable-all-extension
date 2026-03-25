// content-model-override-main.js
// Injected directly into PAGE's JS context via world:'MAIN' (bypasses CSP).
// Intercepts fetch calls to /backend-api/f/conversation and
// replaces the 'model' field in the request payload with 'gpt-5-3'.

(function () {
  if (window.__eabModelOverrideActive) return;
  window.__eabModelOverrideActive = true;

  const TARGET_URL = '/backend-api/f/conversation';
  // Reads dynamically so changing the model live (via window.__eabTargetModel) takes effect immediately
  const getTargetModel = () => window.__eabTargetModel || 'gpt-5-3';

  window.__eabOriginalFetch = window.fetch;

  // Read pre-set value if background injected it before this script ran
  let _targetModel = window.__eabTargetModel || 'gpt-5-3';
  window.__eabSetModel = (m) => { _targetModel = m; window.__eabTargetModel = m; console.log('[EAB] Target model set to:', m); };

  window.fetch = async function (input, init) {
    const urlStr = typeof input === 'string' ? input
                 : (input instanceof Request ? input.url : String(input));

    if (urlStr.includes(TARGET_URL)) {
      try {
        // ChatGPT may call fetch(request) with no init, or fetch(url, {body})
        const isRequestObj = input instanceof Request && !(init && init.body);
        let bodyText;

        if (isRequestObj) {
          bodyText = await input.clone().text();
        } else if (init && typeof init.body === 'string') {
          bodyText = init.body;
        }

        if (bodyText) {
          const body = JSON.parse(bodyText);
          if ('model' in body) {
            console.log('[EAB] Model override:', body.model, '→', _targetModel);
            body.model = _targetModel;
            const newBody = JSON.stringify(body);
            if (isRequestObj) {
              input = new Request(input, { body: newBody });
            } else {
              init = Object.assign({}, init, { body: newBody });
            }
          }
        }
      } catch (e) {
        // Body was not JSON or unreadable — leave untouched
      }
    }

    return window.__eabOriginalFetch.call(this, input, init);
  };

  console.log('[EAB] Model override active — watching', TARGET_URL);
})();
