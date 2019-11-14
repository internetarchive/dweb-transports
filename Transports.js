const Url = require('url');
const errors = require('./Errors');
const utils = require('./utils');
const debug = require('debug')('dweb-transports');
const httptools = require('./httptools');
const each = require('async/each');
const map = require('async/map');
const {p_namingcb, naming} = require('./Naming.js')

class Transports {
    /*
    Handles multiple transports, API should be (almost) the same as for an individual transport)

    Fields:
    _transports         List of transports loaded (internal)
    namingcb            If set will be called cb(urls) => urls  to convert to urls from names.
    _transportclasses   All classes whose code is loaded e.g. {HTTP: TransportHTTP, IPFS: TransportIPFS}
    _optionspaused       Saves paused option for setup
    */

    //TODO a few of these things could be much better as events that are listened for, especially p_statuses

    constructor(options) {
        // THIS IS UNUSED - ALL METHODS ARE STATIC, THERE IS NO Transports INSTANCE
    }

    static _connected() {
        /*
        Get an array of transports that are connected, i.e. currently usable
         */
        return this._transports.filter((t) => (!t.status));
    }
    static p_connectedNames(cb) { //TODO rename to connectedNames
        /*
        resolves to: an array of the names of connected transports
        Note this is async only because the TransportsProxy version of this has to be - that isn't currently used, so this could be made sync
         */
        const res = this._connected().map(t => t.name);
        if (cb) { cb(null, res)} else { return new Promise((resolve, reject) => resolve(res))}
    }
    static async p_connectedNamesParm() { // Doesnt strictly need to be async, but for consistency with Proxy it has to be.
        return (await this.p_connectedNames()).map(n => "transport="+n).join('&')
    }
    static statuses({connected=undefined}={}) { //TODO-API (especially add info:)
      /*
      Return array of statuses,
      connected:  If true then only connected transports
       */
      const ss = Transports._transports.map((t) => { return {name: t.name, status: t.status, info: t.info}});
      return connected ? ss.filter(s => !s.status) : ss;
    }
    static p_statuses(cb) {
      /*
      resolves to: a dictionary of statuses of transports, e.g. { TransportHTTP: STATUS_CONNECTED }
       */
      const res = this.statuses({connected: false}); // No errors possible
      if (cb) { cb(null, res)} else { return new Promise((resolve, reject) => resolve(res))}
    }
    static validFor(urls, func, opts) { //TODO-RELOAD check for noCache support
        /*
        Finds an array or Transports that can support this URL.

        Excludes any transports whose status != 0 as they aren't connected

        urls:       Array of urls
        func:       Function to check support for: fetch, store, add, list, listmonitor, reverse - see supportFunctions on each Transport class
        opts:       Passed to each Transport, esp for supportFeatures
        returns:    Array of pairs of Url & transport instance [ [ u1, t1], [u1, t2], [u2, t1]]
        throws:     CodingError if urls empty or [undefined...]
         */
        if (typeof urls === "string") urls = [urls];
        if (!((urls && urls[0]) || ["store", "newlisturls", "newdatabase", "newtable", "seed"].includes(func)))   {
            console.error("Transports.validFor called with invalid arguments: urls=", urls, "func=", func); // FOr debugging old calling patterns with [ undefined ]
            return [];
        }
        if (!(urls && urls.length > 0)) { // No url supplied we are just checking which transports support this function on no url.
            return this._transports.filter((t) => (t.validFor(undefined, func, opts)))
                .map((t) => [undefined, t]);
        } else {
            return [].concat(
                ...urls.map((url) => typeof url === 'string' ? Url.parse(url) : url) // parse URLs once
                    .map((url) =>
                        this._transports.filter((t) => (t.validFor(url, func, opts))) // [ t1, t2 ]
                            .map((t) => [url, t]))); // [[ u, t1], [u, t2]]
        }
    }
    static async p_urlsValidFor(urls, func, opts) {
        // Need a async version of this for serviceworker and TransportsProxy
        return this.validFor(urls, func, opts).map((ut) => ut[0]);
    }

    // SEE-OTHER-ADDTRANSPORT

    static http() {
        // Find an http transport if it exists.
        return Transports._connected().find((t) => t.name === "HTTP")
    }

    static wolk() {
        // Find a Wolk transport if it exists.
        return Transports._connected().find((t) => t.name === "WOLK")
    }

    static ipfs() {
        // Find an ipfs transport if it exists, in particular, so YJS can use it.
        return Transports._connected().find((t) => t.name === "IPFS")
    }

    static webtorrent() {
        // Find an ipfs transport if it exists, so for example ServiceWorker.p_respondWebTorrent can use it.
        return Transports._connected().find((t) => t.name === "WEBTORRENT")
    }

    static gun() {
        // Find a GUN transport if it exists
        return Transports._connected().find((t) => t.name === "GUN")
    }

    static fluence() {
        // Find a FLUENCE transport if it exists
        return Transports._connected().find((t) => t.name === "FLUENCE")
    }

    static async p_resolveNames(urls) {
        /* Resolve urls that might be names, returning a modified array.
         */
        if (this.mirror) { // Dont do using dweb-mirror as our gateway, as always want to send URLs there.
            return Array.isArray(urls) ? this.gatewayUrls(urls) : this.gatewayUrl(url);
        } else if (this.namingcb) {
            return await this.namingcb(urls);  // Array of resolved urls
        } else {
            return urls;
        }
    }

    static resolveNamesWith(cb) {
        // Set a callback for p_resolveNames
        this.namingcb = cb;
    }

    static togglePaused(name, cb) {
        /*
        Toggle a transport by name,
        name    e.g. "HTTP"
        cb(err, status)
         */
        const transport = this._transports.find((t) => t.name === name);
        if (!transport) {
            cb(undefined);
        } else {
            transport.togglePaused(t => cb(null, t.status));
        }
    }
    // Storage of data

    static async _p_rawstore(tt, data) {
        // Internal method to store at known transports
        let errs = [];
        let rr = await Promise.all(tt.map(async function(t) {
            try {
                debug("Storing %d bytes to %s", data.length, t.name);
                let url = await t.p_rawstore(data);
                debug("Storing %d bytes to %s succeeded: %s", data.length, t.name, url);
                return url; //url
            } catch(err) {
                debug("Storing %d bytes to %s failed: %s", data.length, t.name, err.message);
                errs.push(err);
                return undefined;
            }
        }));
        rr = rr.filter((r) => !!r); // Trim any that had errors
        if (!rr.length) {
            debug("Storing %d bytes failed on all transports", data.length);
            throw new errors.TransportError(errs.map((err)=>err.message).join(', ')); // New error with concatenated messages
        }
        return rr;

    }
    static async p_rawstore(data) {
        /*
        data: Raw data to store - typically a string, but its passed on unmodified here
        returns:    Array of urls of where stored
        throws: TransportError with message being concatenated messages of transports if NONE of them succeed.
         */
        let tt = this.validFor(undefined, "store").map(([u, t]) => t); // Valid connected transports that support "store"
        if (!tt.length) {
            debug("Storing %d bytes failed: no transports available", data.length);
            throw new errors.TransportError('Transports.p_rawstore: Cant find transport for store');
        }
        return this._p_rawstore(tt, data);
    }
    static async p_rawfetch(urls, opts={}) {
        /*
        Fetch the data for a url, transports act on the data, typically storing it.
        urls:	array of urls to retrieve (any are valid)
        opts {
            start,  integer - first byte wanted
            end     integer - last byte wanted (note this is inclusive start=0,end=1023 is 1024 bytes
            timeoutMS   integer - max time to wait on transports (IPFS) that support it
            noCache bool - Skip caching (passed to Transports)
            }
        returns:	string - arbitrary bytes retrieved.
        throws:     TransportError with concatenated error messages if none succeed.
        throws:     CodingError if urls empty or [undefined ... ]
         */
        if (!urls.length)  throw new errors.TransportError("Transports.p_rawfetch given an empty list of urls");
        let resolvedurls = await this.p_resolveNames(urls); // If naming is loaded then convert name to [urls]
        if (!resolvedurls.length)  throw new errors.TransportError("Transports.p_rawfetch none of the urls resolved: " + urls);
        let tt = this.validFor(resolvedurls, "fetch", {noCache: opts.noCache}); //[ [Url,t],[Url,t]] throws CodingError on empty /undefined urls
        if (!tt.length) {
            throw new errors.TransportError("Transports.p_rawfetch cant find any transport for urls: " + resolvedurls);
        }
        //With multiple transports, it should return when the first one returns something.
        let errs = [];
        let failedtransports = [];  // Will accumulate any transports fail on before the success
        for (const [url, t] of tt) {
            try {
                debug("Fetching %s via %s", url.href, t.name);
                let data = await t.p_rawfetch(url, Object.assign({}, opts, {silentFinalError: true}));   // throws errors if fails or timesout
                debug("Fetching %s via %s succeeded %d bytes", url.href, t.name, data.length);
                if (opts.relay && failedtransports.length) {
                    debug("Fetching attempting relay of %d bytes from %s to %o", data.length, url.href, failedtransports.map(t=>t.name));
                    this._p_rawstore(failedtransports, data)
                        .then(uu => debug(`Fetching relayed %d bytes to %o`, data.length, uu)); // Happening async, not waiting and dont care if fails
                }
                //END TODO-MULTI-GATEWAY
                return data;
            } catch (err) {
                failedtransports.push(t);
                errs.push(err);
                debug("Fetching %s via %s failed: %s", url.href, t.name, err.message);
                // Don't throw anything here, loop round for next, only throw if drop out bottom
                //TODO-MULTI-GATEWAY potentially copy from success to failed URLs.
            }
        }
        if (!opts.silentFinalError) {
            debug("Fetching %o failed on all transports", urls);
        }
        throw new errors.TransportError(errs.map((err)=>err.message).join(', '));  //Throw err with combined messages if none succeed
    }
    static fetch(urls, opts={}, cb) {
        if (typeof opts === "function") { cb = opts; opts={}; }
        const prom = this.p_rawfetch(urls, opts);
        if (cb) { prom.then((res)=>{ try { cb(null,res)} catch(err) { debug("Uncaught error in fetch %O",err)}}).catch((err) => cb(err)); } else { return prom; } // Unpromisify pattern v5
    }

// Seeding =====
    // Similar to storing.
    static seed({directoryPath=undefined, fileRelativePath=undefined, ipfsHash=undefined, urlToFile=undefined, torrentRelativePath=undefined}, cb) {
        /*
        ipfsHash:       When passed as a parameter, its checked against whatever IPFS calculates.
                        Its reported, but not an error if it doesn't match. (the cases are complex, for example the file might have been updated).
        urlToFile:      The URL where that file is available, this is to enable transports (e.g. IPFS) that just map an internal id to a URL.
        directoryPath:  Absolute path to the directory, for transports that think in terms of directories (e.g. WebTorrent)
                        this is the unit corresponding to a torrent, and should be where the torrent file will be found or should be built
        fileRelativePath: Path (relative to directoryPath) to the file to be seeded.
        torrentRelativePath:    Path within directory to torrent file if present.
         */
        if (cb) { try { f.call(this, cb) } catch(err) { cb(err)}} else { return new Promise((resolve, reject) => { try { f.call(this, (err, res) => { if (err) {reject(err)} else {resolve(res)} })} catch(err) {reject(err)}})} // Promisify pattern v2
        function f(cb1) {
            let tt = this.validFor(undefined, "seed").map(([u, t]) => t); // Valid connected transports that support "seed"
            if (!tt.length) {
                debug("Seeding: no transports available");
                cb1(null); // Its not (currently) an error to be unable to seed
            } else {
                const res = {};
                each(tt, // [ Transport]
                    (t, cb2) => t.seed({directoryPath, torrentRelativePath, fileRelativePath, ipfsHash, urlToFile},
                        (err, oneres) => { res[t.name] = err ? { err: err.message } :  oneres; cb2(null)}), // Its not an error for t.seed to fail - errors should have been logged by transports
                    (unusederr) => cb1(null, res)); // Return result of any seeds that succeeded as e.g. { HTTP: {}, IPFS: {ipfsHash:} }
            }
        }
    }

    // List handling ===========================================

    static async p_rawlist(urls) {
        urls = await this.p_resolveNames(urls); // If naming is loaded then convert to a name
        let tt = this.validFor(urls, "list"); // Valid connected transports that support "store"
        if (!tt.length) {
            throw new errors.TransportError('Transports.p_rawlist: Cant find transport to "list" urls:'+urls.join(','));
        }
        let errs = [];
        let ttlines = await Promise.all(tt.map(async function([url, t]) {
            try {
                debug("Listing %s via %s", url, t.name);
                let res = await t.p_rawlist(url); // [sig]
                debug("Listing %s via %s retrieved %d items", url, t.name, res.length);
                return res;
            } catch(err) {
                debug("Listing %s via %s failed: %s", url, t.name, err.message);
                errs.push(err);
                return [];
            }
        })); // [[sig,sig],[sig,sig]]
        if (errs.length >= tt.length) {
            // All Transports failed (maybe only 1)
            debug("Listing %o failed on all transports", urls);
            throw new errors.TransportError(errs.map((err)=>err.message).join(', ')); // New error with concatenated messages
        }
        let uniques = {}; // Used to filter duplicates
        return [].concat(...ttlines)
            .filter((x) => (!uniques[x.signature] && (uniques[x.signature] = true)));
    }

    static async p_rawadd(urls, sig) {
        /*
        urls: of lists to add to
        sig: Sig to add
        returns:    undefined
        throws: TransportError with message being concatenated messages of transports if NONE of them succeed.
         */
        //TODO-MULTI-GATEWAY might be smarter about not waiting but Promise.race is inappropriate as returns after a failure as well.
        urls = await this.p_resolveNames(urls); // If naming is loaded then convert to a name
        let tt = this.validFor(urls, "add"); // Valid connected transports that support "store"
        if (!tt.length) {
            debug("Adding to %o failed: no transports available", urls);
            throw new errors.TransportError('Transports.p_rawstore: Cant find transport for urls:'+urls.join(','));
        }
        let errs = [];
        await Promise.all(tt.map(async function([u, t]) {
            try {
                debug("Adding to %s via %s", u, t.name);
                await t.p_rawadd(u, sig); //undefined
                debug("Adding to %s via %s succeeded", u, t.name);
                return undefined;
            } catch(err) {
                debug("Adding to %s via %s failed: %s", u, t.name, err.message);
                errs.push(err);
                return undefined;
            }
        }));
        if (errs.length >= tt.length) {
            debug("Adding to %o failed on all transports", urls);
            // All Transports failed (maybe only 1)
            throw new errors.TransportError(errs.map((err)=>err.message).join(', ')); // New error with concatenated messages
        }
        return undefined;

    }

    static listmonitor(urls, cb, opts={}) {
        /*
        Add a listmonitor for each transport - note this means if multiple transports support it, then will get duplicate events back if everyone else is notifying all of them.
         */
        // Note cant do p_resolveNames since sync but should know real urls of resource by here.
        this.validFor(urls, "listmonitor")
            .map(([u, t]) => {
                t.listmonitor(u, cb, opts);
                debug("Monitoring list %s via %s", u, t.name);
            });
    }

    static async p_newlisturls(cl) {
        // Create a new list in any transport layer that supports lists.
        // cl is a CommonList or subclass and can be used by the Transport to get info for choosing the list URL (normally it won't use it)
        // Note that normally the CL will not have been stored yet, so you can't use its urls.
        let uuu = await Promise.all(this.validFor(undefined, "newlisturls")
            .map(([u, t]) => t.p_newlisturls(cl)) );   // [ [ priv, pub] [ priv, pub] [priv pub] ]
        return [uuu.map(uu=>uu[0]), uuu.map(uu=>uu[1])];    // [[ priv priv priv ] [ pub pub pub ] ]
    }

    // Stream handling ===========================================
    //myArray[Math.floor(Math.random() * myArray.length)];

    static async p_f_createReadStream(urls, {wanturl=false, preferredTransports=[]}={}) { // Note options is options for selecting a stream, not the start/end in a createReadStream call
        /*
        urls:   Url or [urls] of the stream
        wanturl True if want the URL of the stream (for service workers)
        returns:    f(opts) => stream returning bytes from opts.start || start of file to opts.end-1 || end of file
         */
        // Find all the transports that CAN support this request
        let tt = this.validFor(urls, "createReadStream", {}); //[ [Url,t],[Url,t]]  // Can pass options TODO-STREAM support options in validFor
        if (!tt.length) {
            debug("Opening stream from %o failed: no transports available", urls);
            throw new errors.TransportError("Transports.p_createReadStream cant find any transport for urls: " + urls);
        }
        //With multiple transports, it should return when the first one returns something.
        let errs = [];

        // Select first from preferredTransports in the order presented, then the rest at random
        tt.sort((a,b) =>
            ((preferredTransports.indexOf(a[1].name)+1) || 999+Math.random())  - ((preferredTransports.indexOf(b[1].name)+1) || 999+Math.random())
        );

        for (const [url, t] of tt) {
            try {
                debug("Opening stream from %s via %s", url.href, t.name);
                let res = await t.p_f_createReadStream(url, {wanturl} );
                if (!["IPFS","HTTP"].includes(t.name))  // some transports always succeed to open stream (even when it fails) so meaningless
                    debug("Opening stream from %s via %s succeeded", url.href, t.name);
                return res;
            } catch (err) {
                errs.push(err);
                debug("Opening stream from %s via %s failed: %s", url.href, t.name, err.message);
                // Don't throw anything here, loop round for next, only throw if drop out bottom
                //TODO-MULTI-GATEWAY potentially copy from success to failed URLs.
            }
        }
        debug("Opening stream from %o failed on all transports", urls);
        throw new errors.TransportError(errs.map((err)=>err.message).join(', '));  //Throw err with combined messages if none succeed
    }
    static createReadStream(urls, opts, cb) {
        /*
            Different interface, more suitable when just want a stream, now.
            urls:   Url or [urls] of the stream
            opts{
                start, end:   First and last byte wanted (default to 0...last)
                preferredTransports: preferred order to select stream transports (usually determined by application)
            }
            cb(err, stream): Called with open readable stream from the net.
            Returns promise if no cb
         */
        if (typeof opts === "function") { cb = opts; opts = {start: 0}; } // Allow skipping opts
        DwebTransports.p_f_createReadStream(urls, {preferredTransports: (opts.preferredTransports || [])})
            .then(f => {
                let s = f(opts);
                if (cb) { cb(null, s); } else { return(s); }; // Callback or resolve stream
            })
            .catch(err => {
                if (err instanceof errors.TransportError) {
                    console.warn("Transports.createReadStream caught", err.message);
                } else {
                    console.error("Transports.createReadStream caught", err);
                }
                if (cb) { cb(err); } else { reject(err)}
            });
    };


// KeyValue support ===========================================

    static async p_get(urls, keys) {
        /*
        Fetch the values for a url and one or more keys, transports act on the data, typically storing it.
        urls:	array of urls to retrieve (any are valid)
        keys:   array of keys wanted or single key
        returns:	string - arbitrary bytes retrieved or dict of key: value
        throws:     TransportError with concatenated error messages if none succeed.
         */
        let tt = this.validFor(urls, "get"); //[ [Url,t],[Url,t]]
        let debug1 =  Array.isArray(keys) ? `${keys.length} keys` : keys; // "1 keys" or "foo"
        if (!tt.length) {
            debug("Getting %s from %o failed: no transports available", debug1, urls);
            throw new errors.TransportError("Transports.p_get cant find any transport to get keys from urls: " + urls);
        }
        //With multiple transports, it should return when the first one returns something.
        let errs = [];
        for (const [url, t] of tt) {
            try {
                debug("Getting %s from %s via %s", debug1, url.href, t.name);
                let res = await t.p_get(url, keys); //TODO-MULTI-GATEWAY potentially copy from success to failed URLs.
                debug("Getting %s from %s via %s succeeded length=%d", debug1, url.href, t.name, res.length);
                return res;
            } catch (err) {
                errs.push(err);
                debug("Getting %s from %s via %s failed: %s", debug1, url.href, t.name, err.message);
                // Don't throw anything here, loop round for next, only throw if drop out bottom
            }
        }
        debug("Getting %s from %o failed on all transports", debug1, urls);
        throw new errors.TransportError(errs.map((err)=>err.message).join(', '));  //Throw err with combined messages if none succeed
    }
    static async p_set(urls, keyvalues, value) {
        /* Set a series of key/values or a single value
         keyvalues:    Either dict or a string
         value: if kv is a string, this is the value to set
        throws: TransportError with message being concatenated messages of transports if NONE of them succeed.
        */
        urls = await this.p_resolveNames(urls); // If naming is loaded then convert to a name
        let debug1 =  typeof keyvalues === "object" ? `${keyvalues.length} keys` : keyvalues; // "1 keys" or "foo"
        let tt = this.validFor(urls, "set"); //[ [Url,t],[Url,t]]
        if (!tt.length) {
            debug("Setting %s on %o failed: no transports available", debug1, urls);
            throw new errors.TransportError("Transports.p_set cant find any transport for urls: " + urls);
        }
        let errs = [];
        let success = false;
        await Promise.all(tt.map(async function([url, t]) {
            try {
                debug("Setting %s on %s via %s", debug1, url.href, t.name);
                await t.p_set(url, keyvalues, value);
                debug("Setting %s on %s via %s succeeded", debug1, url.href, t.name);
                success = true; // Any one success will return true
            } catch(err) {
                debug("Setting %s on %s via %s failed: %s", debug1, url.href, t.name, err.message);
                errs.push(err);
            }
        }));
        if (!success) {
            debug("Setting %s on %o failed on all transports", debug1, urls);
            throw new errors.TransportError(errs.map((err)=>err.message).join(', ')); // New error with concatenated messages
        }
    }

    static async p_delete(urls, keys) {
        /* Delete a key or a list of keys
         kv:    Either dict or a string
         value: if kv is a string, this is the value to set
        throws: TransportError with message being concatenated messages of transports if NONE of them succeed.
        */
        urls = await this.p_resolveNames(urls); // If naming is loaded then convert to a name
        let debug1 =  Array.isArray(keys) ? `${keys.length} keys` : keys; // "1 keys" or "foo"
        let tt = this.validFor(urls, "set"); //[ [Url,t],[Url,t]]
        if (!tt.length) {
            debug("Deleting %s on %o failed: no transports available", debug1, urls);
            throw new errors.TransportError("Transports.p_set cant find any transport for urls: " + urls);
        }
        let errs = [];
        let success = false;
        await Promise.all(tt.map(async function([url, t]) {
            try {
                debug("Deleting %s on %s via %s", debug1, url.href, t.name);
                await t.p_delete(url, keys);
                debug("Deleting %s on %s via %s succeeded", debug1, url.href, t.name);
                success = true; // Any one success will return true
            } catch(err) {
                debug("Deleting %s on %s via %s failed: %s", debug1, url.href, t.name, err.message);
                errs.push(err);
            }
        }));
        if (!success) {
            debug("Deleting %s on %o failed on all transports", debug1, urls);
            throw new errors.TransportError(errs.map((err)=>err.message).join(', ')); // New error with concatenated messages
        }
    }
    static async p_keys(urls) {
        /*
        Fetch the values for a url and one or more keys, transports act on the data, typically storing it.
        urls:	array of urls to retrieve (any are valid)
        keys:   array of keys wanted
        returns:	string - arbitrary bytes retrieved or dict of key: value
        throws:     TransportError with concatenated error messages if none succeed.
         */
        urls = await this.p_resolveNames(urls); // If naming is loaded then convert to a name
        let tt = this.validFor(urls, "keys"); //[ [Url,t],[Url,t]]
        if (!tt.length) {
            debug("Getting all keys on %o failed: no transports available", urls);
            throw new errors.TransportError("Transports.p_keys cant find any transport for urls: " + urls);
        }
        //With multiple transports, it should return when the first one returns something. TODO make it return the aggregate
        let errs = [];
        for (const [url, t] of tt) {
            try {
                debug("Getting all keys on %s via %s", url.href, t.name);
                let res = await t.p_keys(url); //TODO-MULTI-GATEWAY potentially copy from success to failed URLs.
                debug("Getting all keys on %s via %s succeeded with %d keys", url.href, t.name, res.length);
                return res;
            } catch (err) {
                errs.push(err);
                debug("Getting all keys on %s via %s failed: %s", url.href, t.name, err.message);
                // Don't throw anything here, loop round for next, only throw if drop out bottom
            }
        }
        debug("Getting all keys on %o failed on all transports", urls);
        throw new errors.TransportError(errs.map((err)=>err.message).join(', '));  //Throw err with combined messages if none succeed
    }

    static async p_getall(urls) {
        /*
        Fetch the values for a url and one or more keys, transports act on the data, typically storing it.
        urls:	array of urls to retrieve (any are valid)
        keys:   array of keys wanted
        returns:	array of strings returned for the keys. //TODO consider issues around return a data type rather than array of strings
        throws:     TransportError with concatenated error messages if none succeed.
         */
        urls = await this.p_resolveNames(urls); // If naming is loaded then convert to a name
        let tt = this.validFor(urls, "getall"); //[ [Url,t],[Url,t]]
        if (!tt.length) {
            debug("Getting all values on %o failed: no transports available", urls);
            throw new errors.TransportError("Transports.p_getall cant find any transport for urls: " + urls);
        }
        //With multiple transports, it should return when the first one returns something.
        let errs = [];
        for (const [url, t] of tt) {
            try {
                debug("Getting all values on %s via %s", url.href, t.name);
                let res = await t.p_getall(url); //TODO-MULTI-GATEWAY potentially copy from success to failed URLs.
                debug("Getting all values on %s via %s succeeded with %d values", url.href, t.name, res.length);
                return res;
            } catch (err) {
                errs.push(err);
                debug("Getting all values on %s via %s failed: %s", url.href, t.name, err.message);
                // Don't throw anything here, loop round for next, only throw if drop out bottom
            }
        }
        debug("Getting all keys on %o failed on all transports", urls);
        throw new errors.TransportError(errs.map((err)=>err.message).join(', '));  //Throw err with combined messages if none succeed
    }

    static async p_newdatabase(pubkey) {
        /*
            Create a new database in any transport layer that supports databases (key value pairs).
            pubkey: CommonList, KeyPair, or exported public key
            resolves to: [ privateurl, publicurl]
         */
        let uuu = await Promise.all(this.validFor(undefined, "newdatabase")
            .map(([u, t]) => t.p_newdatabase(pubkey)) );   // [ { privateurl, publicurl} { privateurl, publicurl} { privateurl, publicurl} ]
        return { privateurls: uuu.map(uu=>uu.privateurl), publicurls: uuu.map(uu=>uu.publicurl) };    // { privateurls: [], publicurls: [] }
    }

    static async p_newtable(pubkey, table) {
        /*
            Create a new table in any transport layer that supports the function (key value pairs).
            pubkey: CommonList, KeyPair, or exported public key
            resolves to: [ privateurl, publicurl]
         */
        let uuu = await Promise.all(this.validFor(undefined, "newtable")
            .map(([u, t]) => t.p_newtable(pubkey, table)) );   // [ [ priv, pub] [ priv, pub] [priv pub] ]
        return { privateurls: uuu.map(uu=>uu.privateurl), publicurls: uuu.map(uu=>uu.publicurl)};    // {privateurls: [ priv priv priv ], publicurls: [ pub pub pub ] }
    }

    static async p_connection(urls) {
        /*
        Do any asynchronous connection opening work prior to potentially synchronous methods (like monitor)
         */
        urls = await this.p_resolveNames(urls); // If naming is loaded then convert to a name
        await Promise.all(
            this.validFor(urls, "connection")
                .map(([u, t]) => t.p_connection(u)));
    }

    static monitor(urls, cb, {current=false}={}) {
        /*
        Add a listmonitor for each transport - note this means if multiple transports support it, then will get duplicate events back if everyone else is notifying all of them.
        Stack: KVT()|KVT.p_new => KVT.monitor => (a: Transports.monitor => YJS.monitor)(b: dispatchEvent)
        cb:         function({type, key, value})
        current:    If true then then send all current entries as well
         */
        //Can't its async. urls = await this.p_resolveNames(urls); // If naming is loaded then convert to a name
        this.validFor(urls, "monitor")
            .map(([u, t]) => {
                    debug("Monitoring table %s via %s", u, t.name);
                    t.monitor(u, cb, {current})
                }
            );
    }

    // Setup and connection

    static addtransport(t) {
        /*
        Add a transport to _transports,
         */
        Transports._transports.push(t);
    }

    // Setup Transports - setup0 is called once, and should return quickly, p_setup1 and p_setup2 are asynchronous and p_setup2 relies on p_setup1 having resolved.

    static setup0(tabbrevs, options, cb) {
        /*
        Setup Transports for a range of classes
        tabbrevs is abbreviation HTTP, IPFS, LOCAL or list of them e.g. "HTTP,IPFS"
        cb is callback for when status changes, but there are no status changes here so its not called.
        Handles "LOCAL" specially, turning into a HTTP to a local server (for debugging)

        returns array of transport instances
         */
        // "IPFS" or "IPFS,LOCAL,HTTP"
        let localoptions = {http: {urlbase: "http://localhost:4244"}}; //TODO-MIRROR "localoptions" may not be needed any more
        return tabbrevs.map((tabbrev) => {
            //TODO-SPLIT-UPNEXT remove LOCAL - not used any more
            let transportclass = this._transportclasses[ (tabbrev === "LOCAL") ? "HTTP" : tabbrev ];
            if (!transportclass) {
                debug("Connection to %s unavailable", tabbrev);
                return undefined;
            } else {
                debug("Setting up connection to %s with options %o", tabbrev, options);
                return transportclass.setup0(tabbrev === "LOCAL" ? localoptions : options);
            }
        }).filter(f => !!f); // Trim out any undefined
    }
    static p_setup1(refreshstatus, cb) {
        /* Second stage of setup, connect if possible */
        // Does all setup1a before setup1b since 1b can rely on ones with 1a, e.g. YJS relies on IPFS
        const prom = Promise.all(this._transports
            .filter((t) => (! this._optionspaused.includes(t.name)))
            .map((t) => {
                debug("Connection stage 1 to %s", t.name);
                return t.p_setup1(refreshstatus);
            }))
        if (cb) { prom.catch((err) => cb(err)).then((res)=>cb(null,res)); } else { return prom; } // This should be a standard unpromisify pattern
    }
    static p_setup2(refreshstatus, cb) {
        /* Second stage of setup, connect if possible */
        // Does all setup1a before setup1b since 1b can rely on ones with 1a, e.g. YJS relies on IPFS

        const prom = Promise.all(this._transports
            .filter((t) => (! this._optionspaused.includes(t.name)))
            .map((t) => {
                debug("Connection stage 2 to %s", t.name);
                return t.p_setup2(refreshstatus);
            }));
        if (cb) { prom.catch((err) => cb(err)).then((res)=>cb(null,res)); } else { return prom; } // This should be a standard unpromisify pattern
    }
    static p_stop(refreshstatus, cb) { //TODO-API cb
        if (cb) { try { f.call(this, cb) } catch(err) { cb(err)}} else { return new Promise((resolve, reject) => { try { f.call(this, (err, res) => { if (err) {reject(err)} else {resolve(res)} })} catch(err) {reject(err)}})} // Promisify pattern v2
        /* Disconnect from all services, may not be able to reconnect */
        //TODO rewrite with async/map
        function f(cb) {
            map(this._connected(),
              (t, cb2) => {
                  debug("Stopping %s", t.name);
                  t.stop(refreshstatus, cb2);
              },
              cb);
        }
    }

    static async refreshstatus(t) {
        //Note "this' undefined as called as callback
        let statusclasses = ["transportstatus0","transportstatus1","transportstatus2","transportstatus3","transportstatus4"];
        let el = t.statuselement;
        if (el) {
            el.classList.remove(...statusclasses);
            el.classList.add(statusclasses[t.status]);
        }
        if (Transports.statuscb) {
            Transports.statuscb(t);
        }
    }

    static _tabbrevs(options) {
        // options = {transports, defaulttransports, ... }
        // returns [ABBREVIATION] e.g. ["IPFS","HTTP"]
        let tabbrevs = options.transports;    // Array of transport abbreviations
        if (!(tabbrevs && tabbrevs.length)) { tabbrevs = options.defaulttransports || [] }
        // WOLK is off by default till get working script to include in browsers etc
        // GUN is turned off by default because it fills up localstorage on browser and stops working, https://github.com/internetarchive/dweb-archive/issues/106
        // FLUENCE is turned off by default until tested
        if (! tabbrevs.length) { tabbrevs = ["HTTP", "IPFS", "WEBTORRENT", "HASH"]; } // SEE-OTHER-ADDTRANSPORT
        tabbrevs = tabbrevs.map(n => n.toUpperCase());
        return tabbrevs;
    }
    /**
     * Load required javascript into an html page
     * This is tricky - order is significant,  (see dweb-archive/archive.html for a hopefully working example)
     */
    static loadIntoHtmlPage(options) {
        //TODO move the scripts to dweb-gateway and dweb-mirror then point cdn there (depending on options.mirror or even options.cdn)
        const cdnUrl = "https://cdn.jsdelivr.net/npm";
        //const cdnUrl = "https://unpkg.com";
        this._tabbrevs(options).forEach(t => {
            this._transportclasses[t].scripts.map(s => {
                debug("Loading %s %s", t, s);
                document.write('<script src="' + (s.startsWith("http") ? s : [cdnUrl, s].join('/')) + '"><\/script>');
            });
        })
    }

    /**
     * Load in the required
     * @param {transports: [TRANSPORTNAME], ...}
     *
     * Each transport should have Transport.requires = STRING | [STRING] | { GLOBAL: STRING}
     */
    static loadIntoNode(options) {
      this._tabbrevs(options).forEach(t => {
        this._transportclasses[t].loadIntoNode();
      });
    }

    static connect(options, cb) {
        const prom = this.p_connect(options);
        if (cb) { prom.catch((err) => cb(err)).then((res)=>cb(null,res)); } else { return prom; } // This should be a standard unpromisify pattern
    }

    static async p_connect(options) {
        /*
            This is a standardish starting process, feel free to subclass or replace !
            It will connect to a set of standard transports and is intended to work inside a browser.
            options = { defaulttransports: ["IPFS"], statuselement: el, http: {}, ipfs: {}; paused: ["IPFS"] }
         */
        try {
            options = options || {};
            this._optionspaused = (options.paused || []).map(n => n.toUpperCase());       // Array of transports paused - defaults to none, upper cased
            let transports = this.setup0(this._tabbrevs(options), options); // synchronous
            ["statuscb", "mirror"].forEach(k => { if (options[k]) this[k] = options[k];} )
            //TODO move this to function and then call this from consumer
            if (!!options.statuselement) {
                let statuselement = options.statuselement;
                while (statuselement.lastChild) {statuselement.removeChild(statuselement.lastChild); }   // Remove any exist status
                statuselement.appendChild(
                    utils.createElement("UL", {}, transports.map(t => {
                        let el = utils.createElement("LI",
                            {onclick: "this.source.togglePaused(DwebTransports.refreshstatus);", source: t, name: t.name}, //TODO-SW figure out how t osend this back
                            t.name);
                        t.statuselement = el;   // Save status element on transport
                        return el;
                    }))
                );
            }
            //TODO-SPLIT-UPNEXT invert this, use a waterfall here, and then wrap in promise for p_setup, then put load's here
            await this.p_setup1(this.refreshstatus);
            await this.p_setup2(this.refreshstatus);
            debug("Connection completed to %o", this._connected().map(t=>t.name))
        } catch(err) {
            console.error("ERROR in p_connect:",err.message);
            throw(err);
        }
    }

    static async p_urlsFrom(url) {
        /* Utility to convert to urls form wanted for Transports functions, e.g. from user input
        url:    Array of urls, or string representing url or representing array of urls
        return: Array of strings representing url
         */
        if (typeof(url) === "string") {
            if (url[0] === '[')
                url = JSON.parse(url);
            else if (url.includes(','))
                url = url.split(',');
            else
                url = [ url ];
        }
        if (!Array.isArray(url)) throw new Error(`Unparsable url: ${url}`);
        return url;
    }

    static async p_httpfetchurl(urls) {
        /*
        Utility to take a array of Transport urls, convert back to a single url that can be used for a fetch, typically
        this is done when cant handle a stream, so want to give the url to the <VIDEO> tag.
         */
        //TODO this could be cleverer, it could ask each Transport for a http url and then use them in order of prefernece?
        //TODO which would allow IPFS for example to return a gateway URL
        //return Transports.http()._url(urls.find(u => (u.startsWith("contenthash") || u.startsWith("http") )), "content/rawfetch");
        return urls.find(u => u.startsWith("http"));
    }

    static canonicalName(url, options={}) {
        /*
        Utility function to convert a variety of missentered, or presumed names into a canonical result that can be resolved or passed to a transport
        returns [ protocol e.g. arc or ipfs,  locally relevant address e.g. archive.org/metadata/foo or Q12345
         */
        if (typeof url !== "string") url = Url.parse(url).href;
        // In patterns below http or https; and  :/ or :// are treated the same
        const gateways = ["dweb.me", "ipfs.io"]; // Known gateways, may dynamically load this at some point
        // SEE-OTHER-ADDTRANSPORT
        const protocols = ["ipfs","gun","magnet","yjs","wolk","arc", "contenthash", "http", "https", "fluence"];
        const protocolsWantingDomains = ["arc", "http", "https"];
        const gatewaypatts = [ // Must be before patts because gateway names often start with a valid proto
            /^http[s]?:[/]+([^/]+)[/](\w+)[/](.*)/i,   // https://(gateway)/proto/(internal)  + gateway in list (IPFS gateways. dweb.me)
        ]
        const patts = [ // No overlap between patts & arcpatts, so order unimportant
            /^dweb:[/]+(\w+)[/]+(.*)/i,                         // dweb://(proto)/(internal)
            /^\w+:[/]+(\w+)[/](.*)/i,                           // proto1://proto2//(internal) - maybe only match if proto1=proto2 (must be before proto:/internal)
            /^(\w+):[/]*(.*)/i,                                 // (proto)://(internal) # must be after proto1://proto2
            /^[/]*(\w+)[/](.*)/i,                               // /(proto)//(internal) - maybe only match if proto1=proto2
            /^[/]*dweb[/]*(\w+)[/](.*)/i,                       // /dweb/(proto)//(internal)
        ]
        const arcpatts = [ // No overlap between patts & arcpatts, so order unimportant
            /^http[s]?:[/]+[^/]+[/](archive).(org)[/]*(.*)/i,   // https://localhost;123/(archive.org)/(internal)
            /^http[s]?:[/]+[^/]+[/]arc[/](archive).(org)[/]*(.*)/i,   // https://localhost;123/arc/(archive.org)/(internal)
            /^http[s]?:[/]+dweb.(\w+)[.]([^/]+)[/]*(.*)/i,      // https://dweb.(proto).(dom.ain)/(internal) # Before dweb.dom.ain
            // /^http[s]?:[/]+dweb.([^/]+[.][^/]+[/]*.*)/i,     // https://dweb.(dom.ain)/internal) or https://dweb.(domain) Handled by coe on recognizing above
            /^(http[s])?:[/]+([^/]+)[/]+(.*)/i,                 // https://dom.ain/pa/th
        ]

        for (let patt of gatewaypatts)  {
            let rr = url.match(patt);
            if (rr && gateways.includes(rr[1]) && protocols.includes(rr[2]))
                return {proto: rr[2], internal: rr[3]};
        }
        for (let patt of arcpatts)  {
            let rr = url.match(patt);
            if (rr) {
                if (protocols.includes(rr[1])) {
                    // arc (and possibly others) want the domain as part of the internal
                    return {proto: rr[1], internal: (protocolsWantingDomains.includes(rr[1]) ? [rr[2], rr[3]].join('/') : rr[3])};
                } else {
                    return {proto: "arc", internal: [[rr[1], rr[2]].join('.'), rr[3]].join('/')};
                }
            }
        };
        for (let patt of patts)  {
            let rr = url.match(patt);
            if (rr && protocols.includes(rr[1]))
                return {proto: rr[1], internal: rr[2]};
        };
        return undefined;
    }
    static canonicalUrl(url, options={}) {
        let o = this.canonicalName(url, options);
        return o.protocol + ":/" + o.internal;
    }
    static _o2url(o) {
        return ["http","https"].includes(o.proto)   ? [o.proto, o.internal].join('://') // Shouldnt be relative
                :  o.proto                            ? [this.mirror, o.proto, o.internal].join('/')
                                                    : o.internal; // Uncanonicalizable
    }
    static gatewayUrl(url) {
        // Convert url to gateway url, if not canonicalizable then just pass the url along
        let o = Transports.canonicalName(url);
        return !o ? url : this._o2url(o)
    }
    static gatewayUrls(urls) { //TODO-API
        // Convert urls to gateway urls,
        // Easier to work on single form [ { proto, internal } ]
        const oo = urls.map(url => Transports.canonicalName(url) || { proto: undefined, internal: url });  //if not canonicalizable then just pass the url along
        const oArc = oo.filter(o => ["arc"].includes(o.proto)); // Prefered
        const oProtoOk = oo.filter(o => ["http","https"].includes(o.proto)); // TODO Temporary to fix see https://github.com/internetarchive/dweb-mirror/issues/272
        return (oArc.length ? oArc : oProtoOk)    // Prefered if have them, else others
            .map(o=>this._o2url(o))
    }
}
Transports._transports = [];    // Array of transport instances connected
Transports.naming = naming;
Transports.namingcb = p_namingcb;    // Will be defined by the naming component (turns URLs for names into URLs for transport)
Transports._transportclasses = {};  // Pointers to classes whose code is loaded.
Transports.httptools = httptools;   // Static http tools
exports = module.exports = Transports;
