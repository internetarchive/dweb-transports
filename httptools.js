const nodefetch = require('node-fetch'); // Note, were using node-fetch-npm which had a warning in webpack see https://github.com/bitinn/node-fetch/issues/421 and is intended for clients
const errors = require('./Errors'); // Standard Dweb Errors
const debug = require('debug')('dweb-transports:httptools');
const queue = require('async/queue');

//var fetch,Headers,Request;
//if (typeof(Window) === "undefined") {
if (typeof(fetch) === "undefined") {
    //var fetch = require('whatwg-fetch').fetch; //Not as good as node-fetch-npm, but might be the polyfill needed for browser.safari
    //XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;  // Note this doesnt work if set to a var or const, needed by whatwg-fetch
    fetch = nodefetch;
    Headers = fetch.Headers;      // A class
    Request = fetch.Request;      // A class
} /* else {
    // If on a browser, need to find fetch,Headers,Request in window
    console.log("Loading browser version of fetch,Headers,Request");
    fetch = window.fetch;
    Headers = window.Headers;
    Request = window.Request;
} */
//TODO-HTTP to work on Safari or mobile will require a polyfill, see https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch for comment


httptools = {};
let httpTaskQueue;

function queueSetup({concurrency}) {
    httpTaskQueue = queue((task, cb) => {
        if (task.loopguard === ((typeof window != "undefined") && window.loopguard)) {
            fetch(task.req)
              .then(res => {
                  debug("Fetch of %s succeded", task.what);
                  httpTaskQueue.concurrency++;
                  debug("Raising concurrency to %s", httpTaskQueue.concurrency);
                  cb(null);
                  task.cb(null, res);
              })
              .catch(err => {
                  //TODO-QUEUE add loopguard back in
                  httpTaskQueue.concurrency = Math.max(httpTaskQueue.concurrency-1, 6)
                  debug("Dropping concurrency to %s", httpTaskQueue.concurrency);
                  cb(err);
                  if (--task.count > 0) {
                      debug("Retrying fetch of %s in %s ms: %s", task.what, task.ms, err.message);
                      httpTaskQueue.push(task);
                      /* Alternative with timeouts - not needed
                      let timeout = task.ms;
                      task.ms = Math.floor(task.ms*(1+Math.random())); // Spread out delays incase all requesting same time
                      setTimeout(() => { httpTaskQueue.push(task);}, timeout);
                       */
                  } else {
                      debug("Requeued fetch of %s failed: %s", task.what, err.message);
                      task.cb(err);
                  }
              });
        } else {
            debug("Dropping fetch of %s as window changed from %s to %s", task.what, task.loopguard, window.loopguard);
        }
    }, concurrency)
}
queueSetup({concurrency: 6});

function queuedFetch(req, ms, count, what) {
    return new Promise((resolve, reject) => {
        count = count || 1; // 0 means 1
        httpTaskQueue.push({
            req, count, ms, what,
            loopguard: (typeof window != "undefined") && window.loopguard, // Optional global parameter, will cancel any loops if changes
            cb: (err, res) => {
                    if(err) { reject(err); } else {resolve(res); }
                },
        });
    });
}

async function loopfetch(req, ms, count, what) {
    /*
    A workaround for a nasty Chrome issue which fails if there is a (cross-origin?) fetch of more than 6 files.  See other WORKAROUND-CHROME-CROSSORIGINFETCH
    Loops at longer and longer intervals trying
    req:        Request
    ms:         Initial wait between polls
    count:      Max number of times to try (0 means just once)
    what:       Name of what retrieving for log (usually file name or URL)
    returns Response:
     */
    let lasterr;
    let loopguard = (typeof window != "undefined") && window.loopguard; // Optional global parameter, will cancel any loops if changes
    count = count || 1; // count of 0 actually means 1
    while (count-- && (loopguard === ((typeof window != "undefined") && window.loopguard)) ) {
        try {
            return await fetch(req);
        } catch(err) {
            lasterr = err;
            debug("Delaying %s by %d ms because %s", what, ms, err.message);
            await new Promise(resolve => {setTimeout(() => { resolve(); },ms)})
            ms = Math.floor(ms*(1+Math.random())); // Spread out delays incase all requesting same time
        }
    }
    console.warn("loopfetch of",what,"failed");
    if (loopguard !== ((typeof window != "undefined") && window.loopguard)) {
        debug("Looping exited because of page change %s", what);
        throw new Error("Looping exited because of page change "+ what)
    } else {
        throw(lasterr);
    }
}

httptools.p_httpfetch = async function(httpurl, init, {wantstream=false, retries=undefined}={}) { // Embrace and extend "fetch" to check result etc.
    /*
    Fetch a url

    httpurl: optional (depends on command)
    init:   {headers}
    resolves to: data as text or json depending on Content-Type header
    throws: TransportError if fails to fetch
     */
    try {
        // THis was get("range") but that works when init.headers is a Headers, but not when its an object
        debug("p_httpfetch: %s %o", httpurl, init.headers.range || "" );
        //console.log('CTX=',init["headers"].get('Content-Type'))
        // Using window.fetch, because it doesn't appear to be in scope otherwise in the browser.
        let req = new Request(httpurl, init);
        //let response = await fetch(req);
        let response = await queuedFetch(req, 500, retries, "fetching "+httpurl);
        // fetch throws (on Chrome, untested on Firefox or Node) TypeError: Failed to fetch)
        // Note response.body gets a stream and response.blob gets a blob and response.arrayBuffer gets a buffer.
        if (response.ok) {
            let contenttype = response.headers.get('Content-Type');
            if (wantstream) {
                return response.body; // Note property while json() or text() are functions
            } else if ((typeof contenttype !== "undefined") && contenttype.startsWith("application/json")) {
                return response.json(); // promise resolving to JSON
            } else if ((typeof contenttype !== "undefined") && contenttype.startsWith("text")) { // Note in particular this is used for responses to store
                return response.text();
            } else { // Typically application/octetStream when don't know what fetching
                return new Buffer(await response.arrayBuffer()); // Convert arrayBuffer to Buffer which is much more usable currently
            }
        }
        // noinspection ExceptionCaughtLocallyJS
        throw new errors.TransportError(`Transport Error ${httpurl} ${response.status}: ${response.statusText}`);
    } catch (err) {
        // Error here is particularly unhelpful - if rejected during the COrs process it throws a TypeError
        debug("p_httpfetch failed: %s", err.message); //  note TypeErrors are generated by CORS or the Chrome anti DDOS 'feature' should catch them here and comment
        if (err instanceof errors.TransportError) {
            throw err;
        } else {
            throw new errors.TransportError(`Transport error thrown by ${httpurl}: ${err.message}`);
        }
    }
}

httptools.p_GET = function(httpurl, opts={}, cb) {
    /*  Locate and return a block, based on its url
        Throws TransportError if fails
        opts {
            start, end,     // Range of bytes wanted - inclusive i.e. 0,1023 is 1024 bytes
            wantstream,     // Return a stream rather than data
            retries=12,        // How many times to retry
            noCache         // Add Cache-Control: no-cache header
            }
        returns result via promise or cb(err, result)
    */
    if (typeof opts  === "function") { cb = opts; opts = {}; }
    let headers = new Headers();
    if (opts.start || opts.end) headers.append("range", `bytes=${opts.start || 0}-${(opts.end<Infinity) ? opts.end : ""}`);
    //if (opts.noCache) headers.append("Cache-Control", "no-cache"); It complains about preflight with no-cache
    const retries = typeof opts.retries === "undefined" ? 12 : opts.retries;
    let init = {    //https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch
        method: 'GET',
        headers: headers,
        mode: 'cors',
        cache: opts.noCache ? 'no-cache' : 'default', // In Chrome, This will set Cache-Control: max-age=0
        redirect: 'follow',  // Chrome defaults to manual
        keepalive: true    // Keep alive - mostly we'll be going back to same places a lot
    };
    const prom = httptools.p_httpfetch(httpurl, init, {retries, wantstream: opts.wantstream}); // This s a real http url
    //if (cb) { prom.then((res)=>cb(null,res)).catch((err) => cb(err)); } else { return prom; } // Unpromisify pattern v3
    //if (cb) { prom.catch((err) => cb(err)).then((res)=>cb(null,res)).catch((err) => debug("Uncaught error %O",err)); } else { return prom; } // Unpromisify pattern v4
    if (cb) { prom.then((res)=>{ try { cb(null,res)} catch(err) { debug("Uncaught error %O",err)}}).catch((err) => cb(err)); } else { return prom; } // Unpromisify pattern v5
}
httptools.p_POST = function(httpurl, opts={}, cb) {
    /* Locate and return a block, based on its url
    opts = { data, contenttype, retries }
    returns result via promise or cb(err, result)
     */
    // Throws TransportError if fails
    //let headers = new window.Headers();
    //headers.set('content-type',type); Doesn't work, it ignores it
    if (typeof opts  === "function") { cb = opts; opts = {}; }
    const retries = typeof opts.retries === "undefined" ? 0 : opts.retries;
    let init = {
        //https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch
        //https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name for headers tat cant be set
        method: 'POST',
        headers: {}, //headers,
        //body: new Buffer(data),
        body: opts.data,
        mode: 'cors',
        cache: 'default',
        redirect: 'follow',  // Chrome defaults to manual
        keepalive: false    // Keep alive - mostly we'll be going back to same places a lot
    };
    if (opts.contenttype) init.headers["Content-Type"] = opts.contenttype;
    const prom = httptools.p_httpfetch(httpurl, init, {retries});
    if (cb) { prom.then((res)=>cb(null,res)).catch((err) => cb(err)); } else { return prom; } // Unpromisify pattern v3
}


exports = module.exports = httptools;
