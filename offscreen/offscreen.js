/**
 * Offscreen Document - 用于绑定扩展权限执行跨域请求
 * 解决 Service Worker fetch CORS 限制问题
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OFFSCREEN_FETCH') {
    handleFetch(message.url, message.options)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function handleFetch(url, options = {}) {
  const xhr = new XMLHttpRequest();

  return new Promise((resolve, reject) => {
    xhr.open(options.method || 'GET', url, true);

    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        xhr.setRequestHeader(key, value);
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data);
        } catch (e) {
          resolve(xhr.responseText);
        }
      } else {
        reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.ontimeout = () => reject(new Error('Request timeout'));
    xhr.timeout = 30000;

    xhr.send(options.body || null);
  });
}
