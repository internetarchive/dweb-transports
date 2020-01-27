const nodefetch = require('node-fetch'); // Note, were using node-fetch-npm which had a warning in webpack see https://github.com/bitinn/node-fetch/issues/421 and is intended for clients
const debug = require('debug')('dweb-transports:httptools');
const queue = require('async/queue');
const { TransportError } = require('./Errors'); // Standard Dweb Errors

// var fetch,Headers,Request;
// if (typeof(Window) === "undefined") {
if (typeof (fetch) === 'undefined') {
  // var fetch = require('whatwg-fetch').fetch; //Not as good as node-fetch-npm, but might be the polyfill needed for browser.safari
  // XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;  // Note this doesnt work if set to a var or const, needed by whatwg-fetch
  /* eslint-disable-next-line no-global-assign */
  fetch = nodefetch;
  /* eslint-disable-next-line no-global-assign */
  Headers = fetch.Headers;      // A class
  /* eslint-disable-next-line no-global-assign */
  Request = fetch.Request;      // A class
} /* else {
    // If on a browser, need to find fetch,Headers,Request in window
    console.log("Loading browser version of fetch,Headers,Request");
    fetch = window.fetch;
    Headers = window.Headers;
    Request = window.Request;
} */
// TODO-HTTP to work on Safari or mobile will require a polyfill, see https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch for comment


let httpTaskQueue;

function queueSetup({ concurrency }) {
  httpTaskQueue = queue((task, cb) => {
    if (task.loopguard === ((typeof window !== 'undefined') && window.loopguard)) {
      fetch(task.req)
        .then(res => {
          debug('Fetch of %s opened', task.what);
          httpTaskQueue.concurrency = Math.min(httpTaskQueue.concurrency + 1, httpTaskQueue.running() + 6);
          // debug("Raising concurrency to %s", httpTaskQueue.concurrency);
          cb(null); // This is telling the queue that we are done
          task.cb(null, res); // This is the caller of the task
        })
        .catch(err => {
          // Adjust concurrency, dont go below running number (which is running-1 because this failed task counts)
          // and we know browser doesnt complain below 6
          httpTaskQueue.concurrency = Math.max(httpTaskQueue.concurrency - 1, 6, httpTaskQueue.running() - 1);
          // debug("Dropping concurrency to %s", httpTaskQueue.concurrency);
          cb(err); // Tell queue done with an error
          /* eslint-disable-next-line no-param-reassign */
          if (--task.count > 0 && !['ENOTFOUND'].includes(err.errno)) {
            debug('Retrying fetch of %s in %s ms: %s', task.what, task.ms, err.message);
            httpTaskQueue.push(task);
            /* Alternative with timeouts - not needed
            let timeout = task.ms;
            task.ms = Math.floor(task.ms*(1+Math.random())); // Spread out delays in case all requesting same time
            setTimeout(() => { httpTaskQueue.push(task);}, timeout);
             */
          } else {
            // Dont report final error as sole consumer (of queuedFetch) does - this could be parameterised later
            // debug("Requeued fetch of %s failed: %s", task.what, err.message);
            task.cb(err);
          }
        });
    } else {
      const err = new Error(`Dropping fetch of ${task.what} as window changed from ${task.loopguard} to ${window.loopguard}`);
      // Dont report final error as sole consumer (of queuedFetch) does - this could be parameterised later
      // debug("Dropping fetch of %s as window changed from %s to %s", task.what, task.loopguard, window.loopguard);
      task.cb(err); // Tell caller it failed
      cb(err); // Tell queue it failed
    }
  }, concurrency);
}
queueSetup({ concurrency: 6 });

function queuedFetch(req, ms, count, what) {
  return new Promise((resolve, reject) => {
    /* eslint-disable-next-line no-param-reassign */
    count = count || 1; // 0 means 1
    httpTaskQueue.push({
      req, count, ms, what,
      loopguard: (typeof window !== 'undefined') && window.loopguard, // Optional global parameter, will cancel any loops if changes
      cb: (err, res) => {
        if (err) { reject(err); } else { resolve(res); }
      },
    });
  });
}

/* OBSOLETE - replaced by queuedFetch
async function loopfetch(req, ms, count, what) {
  /-*
  A workaround for a nasty Chrome issue which fails if there is a (cross-origin?) fetch of more than 6 files.  See other WORKAROUND-CHROME-CROSSORIGINFETCH
  Loops at longer and longer intervals trying
  req:        Request
  ms:         Initial wait between polls
  count:      Max number of times to try (0 means just once)
  what:       Name of what retrieving for log (usually file name or URL)
  returns Response:
   *-/
  let lasterr;
  const loopguard = (typeof window !== 'undefined') && window.loopguard; // Optional global parameter, will cancel any loops if changes
  count = count || 1; // count of 0 actually means 1
  while (count-- && (loopguard === ((typeof window !== 'undefined') && window.loopguard))) {
    try {
      return await fetch(req);
    } catch (err) {
      lasterr = err;
      debug('Delaying %s by %d ms because %s', what, ms, err.message);
      await new Promise(resolve => { setTimeout(() => { resolve(); }, ms); });
      ms = Math.floor(ms * (1 + Math.random())); // Spread out delays in case all requesting same time
    }
  }
  console.warn('loopfetch of', what, 'failed');
  if (loopguard !== ((typeof window !== 'undefined') && window.loopguard)) {
    debug('Looping exited because of page change %s', what);
    throw new Error('Looping exited because of page change ' + what);
  } else {
    throw (lasterr);
  }
}
*/

/**
 * Fetch a url
 *
 * @param httpurl string    URL.href i.e. http:... or https:...
 * @param init {headers}
 * @param wantstream BOOL   True if want to return a stream (otherwise buffer)
 * @param retries INT       Number of times to retry if underlying OS call fails (eg. "INSUFFICIENT RESOURCES") (wont retry on 404 etc)
 * @param silentFinalError BOOL True if should not report final error as caller will
 * @returns {Promise<*>}    Data as text, or json as object or stream depending on Content-Type header adn wantstream
 * @throws TransportError   if fails to fetch
 */
async function p_httpfetch(httpurl, init, { wantstream = false, retries = undefined, silentFinalError = false } = {}) { // Embrace and extend "fetch" to check result etc.
  try {
    // THis was get("range") but that works when init.headers is a Headers, but not when its an object
    debug('p_httpfetch: %s %o', httpurl, init.headers.range || '');
    // console.log('CTX=',init["headers"].get('Content-Type'))
    // Using window.fetch, because it doesn't appear to be in scope otherwise in the browser.
    const req = new Request(httpurl, init);

    // EITHER Use queuedFetch if have async/queue
    const response = await queuedFetch(req, 500, retries, httpurl);
    // OR Use loopfetch if dont have async/queue and hitting browser Insufficient resources
    // let response = await loopfetch(req, 500, retries, httpurl);
    // OR use fetch for simplicity
    // let response = await fetch(req);

    // fetch throws (on Chrome, untested on Firefox or Node) TypeError: Failed to fetch)
    // Note response.body gets a stream and response.blob gets a blob and response.arrayBuffer gets a buffer.
    if (response.ok) {
      const contenttype = response.headers.get('Content-Type');
      if (wantstream) {
        return response.body; // Note property while json() or text() are functions
      } else if ((typeof contenttype !== 'undefined') && contenttype.startsWith('application/json')) {
        return response.json(); // promise resolving to JSON
      } else if ((typeof contenttype !== 'undefined') && contenttype.startsWith('text')) { // Note in particular this is used for responses to store
        return response.text();
      } else { // Typically application/octetStream when don't know what fetching
        return new Buffer(await response.arrayBuffer()); // Convert arrayBuffer to Buffer which is much more usable currently
      }
    }
    // noinspection ExceptionCaughtLocallyJS
    throw new TransportError(`Transport Error ${httpurl} ${response.status}: ${response.statusText}`, { response });
  } catch (err) {
    // Error here is particularly unhelpful - if rejected during the COrs process it throws a TypeError
    if (!silentFinalError) {
      debug('p_httpfetch failed: %s', err.message); //  note TypeErrors are generated by CORS or the Chrome anti DDOS 'feature' should catch them here and comment
    }
    if (err instanceof TransportError) {
      throw err;
    } else {
      throw new TransportError(`Transport error thrown by ${httpurl}: ${err.message}`);
    }
  }
}

/**
 *
 * @param httpurl STRING|Url
 * @param opts
 *         opts {
 *           start, end,     // Range of bytes wanted - inclusive i.e. 0,1023 is 1024 bytes
 *          wantstream,     // Return a stream rather than data
 *          retries=12,        // How many times to retry
 *          noCache         // Add Cache-Control: no-cache header
 *          }
 * @param cb f(err, res)    // See p_httpfetch for result
 * @returns {Promise<*>}    // If no cb.
 */
function p_GET(httpurl, opts = {}, cb) {
  /*  Locate and return a block, based on its url
      Throws TransportError if fails
      opts {
          start, end,     // Range of bytes wanted - inclusive i.e. 0,1023 is 1024 bytes
          wantstream,     // Return a stream rather than data
          retries=12,        // How many times to retry
          noCache         // Add Cache-Control: no-cache header
          silentFinalError    // If set then dont print final error
          }
      returns result via promise or cb(err, result)
  */
  /* eslint-disable-next-line no-param-reassign */ /* Ensuring parameter is consistent */
  if (typeof httpurl !== 'string') httpurl = httpurl.href;    // Assume its a URL as no way to use "instanceof" on URL across node/browser
  const headers = new Headers();
  if (opts.start || opts.end) headers.append('range', `bytes=${opts.start || 0}-${(opts.end < Infinity) ? opts.end : ''}`);
  // if (opts.noCache) headers.append("Cache-Control", "no-cache"); It complains about preflight with no-cache
  const retries = typeof opts.retries === 'undefined' ? 12 : opts.retries;
  const init = {    // https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch
    method: 'GET',
    headers,
    mode: 'cors',
    cache: opts.noCache ? 'no-cache' : 'default', // In Chrome, This will set Cache-Control: max-age=0
    redirect: 'follow',  // Chrome defaults to manual
    keepalive: true    // Keep alive - mostly we'll be going back to same places a lot
  };
  const prom = p_httpfetch(httpurl, init, { retries, wantstream: opts.wantstream, silentFinalError: opts.silentFinalError }); // This s a real http url
  if (cb) { prom.then((res) => { try { cb(null, res); } catch (err) { debug('p_GET Uncaught error in callback %O', err); } }).catch((err) => cb(err)); } else { return prom; } // Unpromisify pattern v5
}

function p_POST(httpurl, opts = {}, cb) {
  /* Locate and return a block, based on its url
  opts = { data, contenttype, retries }
  returns result via promise or cb(err, result)
   */
  // Throws TransportError if fails
  // let headers = new window.Headers();
  // headers.set('content-type',type); Doesn't work, it ignores it
  /* eslint-disable-next-line no-param-reassign */ /* Standard pattern to allow opts to be omitted */
  if (typeof opts  === 'function') { cb = opts; opts = {}; }
  /* eslint-disable-next-line no-param-reassign */ /* Standard pattern to allow it to handle URL as string or Obj */
  if (typeof httpurl !== 'string') httpurl = httpurl.href;    // Assume its a URL as no way to use "instanceof" on URL across node/browser
  const retries = typeof opts.retries === 'undefined' ? 0 : opts.retries;
  const init = {
    // https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch
    // https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name for headers tat cant be set
    method: 'POST',
    headers: {}, // headers,
    // body: new Buffer(data),
    body: opts.data,
    mode: 'cors',
    cache: 'default',
    redirect: 'follow',  // Chrome defaults to manual
    keepalive: false    // Keep alive - mostly we'll be going back to same places a lot
  };
  if (opts.contenttype) init.headers['Content-Type'] = opts.contenttype;
  const prom = p_httpfetch(httpurl, init, { retries });
  if (cb) { prom.then((res) => cb(null, res)).catch((err) => cb(err)); } else { return prom; } // Unpromisify pattern v3
}

exports = module.exports = { p_httpfetch, p_GET, p_POST };
