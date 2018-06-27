const nodefetch = require('node-fetch'); // Note, were using node-fetch-npm which had a warning in webpack see https://github.com/bitinn/node-fetch/issues/421 and is intended for clients
const errors = require('./Errors'); // Standard Dweb Errors

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

async function loopfetch(req, ms, count, what) {
    let lasterr;
    let loopguard = (typeof window != "undefined") && window.loopguard; // Optional global parameter, will cancel any loops if changes
    while (count-- && (loopguard === ((typeof window != "undefined") && window.loopguard)) ) {
        try {
            return await fetch(req);
        } catch(err) {
            lasterr = err;
            console.log("Delaying", what,"by", ms, "because", err.message);
            await new Promise(resolve => {setTimeout(() => { resolve(); },ms)})
            ms = ms*(1+Math.random()); // Spread out delays incase all requesting same time
        }
    }
    console.log("Looping",what,"failed");
    if (loopguard !== (window && window.loopguard)) {
        console.log("Looping exited because of page change "+ what);
        throw new Error("Looping exited because of page change "+ what)
    } else {
        throw(lasterr);
    }
}

httptools.p_httpfetch = async function(httpurl, init, verbose) { // Embrace and extend "fetch" to check result etc.
    /*
    Fetch a url

    url: optional (depends on command)
    resolves to: data as text or json depending on Content-Type header
    throws: TransportError if fails to fetch
     */
    try {
        if (verbose) console.log("httpurl=%s init=%o", httpurl, init);
        //console.log('CTX=',init["headers"].get('Content-Type'))
        // Using window.fetch, because it doesn't appear to be in scope otherwise in the browser.
        let req = new Request(httpurl, init);
        //let response = await fetch(new Request(httpurl, init)).catch(err => console.exception(err));
        let response = await loopfetch(req, 500, 12, "fetching "+httpurl);
        // fetch throws (on Chrome, untested on Firefox or Node) TypeError: Failed to fetch)
        // Note response.body gets a stream and response.blob gets a blob and response.arrayBuffer gets a buffer.
        if (response.ok) {
            let contenttype = response.headers.get('Content-Type');
            if (contenttype === "application/json") {
                return response.json(); // promise resolving to JSON
            } else if (contenttype.startsWith("text")) { // Note in particular this is used for responses to store
                return response.text();
            } else { // Typically application/octetStream when don't know what fetching
                return new Buffer(await response.arrayBuffer()); // Convert arrayBuffer to Buffer which is much more usable currently
            }
        }
        // noinspection ExceptionCaughtLocallyJS
        throw new errors.TransportError(`Transport Error ${response.status}: ${response.statusText}`);
    } catch (err) {
        // Error here is particularly unhelpful - if rejected during the COrs process it throws a TypeError
        console.log("Note error from fetch might be misleading especially TypeError can be Cors issue:",httpurl);
        if (err instanceof errors.TransportError) {
            throw err;
        } else {
            throw new errors.TransportError(`Transport error thrown by ${httpurl}: ${err.message}`);
        }
    }
}


httptools.p_GET = async function(httpurl, opts={}) {
    /*  Locate and return a block, based on its url
        Throws TransportError if fails
        opts {
            start, end,     // Range of bytes wanted - inclusive i.e. 0,1023 is 1024 bytes
            verbose }
        resolves to: URL that can be used to fetch the resource, of form contenthash:/contenthash/Q123
    */
    let headers = new Headers();
    if (opts.start || opts.end) headers.append("range", `bytes=${opts.start || 0}-${opts.end || ""}`);
    let init = {    //https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch
        method: 'GET',
        headers: headers,
        mode: 'cors',
        cache: 'default',
        redirect: 'follow',  // Chrome defaults to manual
        keepalive: true    // Keep alive - mostly we'll be going back to same places a lot
    };
    return await httptools.p_httpfetch(httpurl, init, opts.verbose); // This s a real http url
}
httptools.p_POST = async function(httpurl, type, data, verbose) {
    // Locate and return a block, based on its url
    // Throws TransportError if fails
    //let headers = new window.Headers();
    //headers.set('content-type',type); Doesn't work, it ignores it
    let init = {
        //https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch
        //https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name for headers tat cant be set
        method: 'POST',
        headers: {}, //headers,
        //body: new Buffer(data),
        body: data,
        mode: 'cors',
        cache: 'default',
        redirect: 'follow',  // Chrome defaults to manual
        keepalive: true    // Keep alive - mostly we'll be going back to same places a lot
    };
    return await httptools.p_httpfetch(httpurl, init, verbose);
}

exports = module.exports = httptools;