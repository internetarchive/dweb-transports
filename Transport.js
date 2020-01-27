/* eslint-disable camelcase, indent */
const waterfall = require('async/waterfall');
const Url = require('url');
const stream = require('readable-stream');
const debug = require('debug')('dweb-transports:transport');
const { IntentionallyUnimplementedError, ToBeImplementedError } = require('./Errors'); // Standard Dweb Errors
const Transports = require('./Transports');

function delay(ms, val) { return new Promise(resolve => { setTimeout(() => { resolve(val); }, ms); }); }

class Transport {
  /*
    constructor(options) {
        /*
        Doesnt do anything, its all done by SuperClasses,
        Superclass should merge with default options, call super

        Fields:
        name:   Short name of element e.g. HTTP IPFS WEBTORRENT GUN
    }
  */

    /**
     * Load the code for the transport,
     * By default uses TransportXXX.requires
     * requires can be any of
     * STRING: require it and return result
     * {KEY: STRING}  require string and assign to global Key
     * [STRING]: Require each of them (e.g. Gun)
     * Can also be superclassed e.g. Wolk
     */
    static loadIntoNode() {
        const requires = this.requires;
        if (Array.isArray(requires)) {
            requires.map(r => {
                debug('Requiring %s', r);
                /* eslint-disable-next-line import/no-dynamic-require, global-require */
                require(r);
            });
        } else if (typeof requires === "object") {
            Object.entries(requires).map(kv => {
                debug("Requiring %s %s", t, s);
                /* eslint-disable-next-line import/no-dynamic-require, global-require */
                global[kv[0]] = require(kv[1]);
            })
        } else if (typeof requires === "string") {
          /* eslint-disable-next-line import/no-dynamic-require, global-require */
          require(requires);
        }
    }

    static setup0(options) {
        /*
        First part of setup, create obj, add to Transports but dont attempt to connect, typically called instead of p_setup if want to parallelize connections.
        */
        throw new IntentionallyUnimplementedError("Intentionally undefined function Transport.setup0 should have been subclassed");
        }

    p_setup1() {
        /*
        Setup the resource and open any P2P connections etc required to be done just once. Asynchronous and should leave status=STATUS_STARTING until it resolves, or STATUS_FAILED if fails.

        Resolves to    the Transport instance
        */
        return this;
    }
    p_setup2() {
        /*
        Works like p_setup1 but runs after p_setup1 has completed for all transports. This allows for example YJS to wait for IPFS to be connected in TransportIPFS.setup1() and then connect itself using the IPFS object.
        Resolves to    the Transport instance
        */
        return this;
    }
    static async p_setup(options, cb) {
        /*
        A deprecated utility to simply setup0 then p_setup1 then p_setup2 to allow a transport to be started in one step, normally Transports.p_setup should be called instead.
        */
        let t = await this.setup0(options) // Sync version that doesnt connect
            .p_setup1(); // And connect

        return t.p_setup2();     // And connect
    }
    /* Disconnect from the transport service - there is no guarrantee that a restart will be successfull so this is usually only for when exiting */
    stop(cb) {
        this.setStatus(Transport.STATUS_FAILED);
        cb(null, this);
    }
    togglePaused(cb) {
        /*
        Switch the state of the transport between STATUS_CONNECTED and STATUS_PAUSED,
        in the paused state it will not be used for transport but, in some cases, will still do background tasks like serving files.

        cb(transport)=>void a callback called after this is run, may be used for example to change the UI
         */
        switch (this.status) {
            case Transport.STATUS_CONNECTED:
                this.setStatus(Transport.STATUS_PAUSED);
                break;
            case Transport.STATUS_PAUSED:
                this.setStatus(Transport.STATUS_CONNECTED);   // Superclass might change to STATUS_STARTING if needs to stop/restart
                break;
            case Transport.STATUS_LOADED:
                this.p_setup1().then((t)=>t.p_setup2()); // Allows for updating status progressively as attempts to connect
        }
        if (cb) cb(this);
    }

    async p_status() {
        /*
        Check the status of the underlying transport. This may update the "status" field from the underlying transport.
        returns:    a numeric code for the status of a transport.
        */
        return this.status;
    }

    connected() {
        // True if connected (status==STATUS_CONNECTED==0) should not need subclassing
        return ! this.status;
    }
    supports(url, func, {noCache=undefined}={}) { //TODO-API
        /*
        Determine if this transport supports a certain set of URLs and a func

        :param url: String or parsed URL
        :param opts:    { noCache }  check against supportFeatures
        :return:    true if this protocol supports these URLs and this func
        :throw:     TransportError if invalid URL
         */
        if (typeof url === "string") {
            url = Url.parse(url);    // For efficiency, only parse once.
        }
        if (url && !url.protocol) {
            throw new Error("URL failed to specific a scheme (before :) " + url.href)
        } //Should be TransportError but out of scope here
        // noinspection Annotator  supportURLs is defined in subclasses
        return (    (!url || this.supportURLs.includes(url.protocol.slice(0, -1)))
            && (!func || this.supportFunctions.includes(func))
            && (!noCache || this.supportFeatures.includes("noCache"))
        )
    }

    validFor(url, func, opts) {
        // By default a transport can handle a url and a func if its connected and supports that url/func
        // This shouldnt need subclassing, an exception is HTTP which only applies "connected" against urls heading for the gateway
        return this.connected() && this.supports(url, func, opts);
    }


    p_rawstore(data, opts) {
        /*
        Store a blob of data onto the decentralised transport.
        Returns a promise that resolves to the url of the data

        :param string|Buffer data: Data to store - no assumptions made to size or content
        :resolve string: url of data stored
         */
        throw new ToBeImplementedError("Intentionally undefined function Transport.p_rawstore should have been subclassed");
    }

    async p_rawstoreCaught(data) {
        try {
            return await this.p_rawstore(data);
        } catch (err) {

        }
    }
    p_store() {
        throw new ToBeImplementedError("Undefined function Transport.p_store - may define higher level semantics here (see Python)");
    }

    //noinspection JSUnusedLocalSymbols

    p_rawfetch(url, {timeoutMS=undefined, start=undefined, end=undefined, relay=false}={}) {
        /*
        Fetch some bytes based on a url, no assumption is made about the data in terms of size or structure.
        Where required by the underlying transport it should retrieve a number if its "blocks" and concatenate them.
        Returns a new Promise that resolves currently to a string.
        There may also be need for a streaming version of this call, at this point undefined.

        :param string url:  URL of object being retrieved
        :param timeoutMS    Max time to wait on transports that support it (IPFS for fetch)
        :param start,end    Inclusive byte range wanted (must be supported, uses a "slice" on output if transport ignores it.
        :param relay        If first transport fails, try and retrieve on 2nd, then store on 1st, and so on.

        :resolve string: Return the object being fetched, (note currently returned as a string, may refactor to return Buffer)
        :throws:        TransportError if url invalid - note this happens immediately, not as a catch in the promise
         */
        console.assert(false, "Intentionally undefined  function Transport.p_rawfetch should have been subclassed");
        return "UNIMPLEMENTED";
    }

    p_fetch() {
        throw new ToBeImplementedError("Undefined function Transport.p_fetch - may define higher level semantics here (see Python)");
    }

    p_rawadd(url, sig) {
        /*
        Store a new list item, ideally it should be stored so that it can be retrieved either by "signedby" (using p_rawlist) or
        by "url" (with p_rawreverse). The underlying transport does not need to guarantee the signature,
        an invalid item on a list should be rejected on higher layers.

        :param string url: String identifying an object being added to the list.
        :param Signature sig: A signature data structure.
        :resolve undefined:
         */
        throw new ToBeImplementedError("Undefined function Transport.p_rawadd");
    }

    p_rawlist(url) {
        /*
        Fetch all the objects in a list, these are identified by the url of the public key used for signing.
        (Note this is the 'signedby' parameter of the p_rawadd call, not the 'url' parameter
        Returns a promise that resolves to the list.
        Each item of the list is a dict: {"url": url, "date": date, "signature": signature, "signedby": signedby}
        List items may have other data (e.g. reference ids of underlying transport)

        :param string url: String with the url that identifies the list.
        :resolve array: An array of objects as stored on the list.
         */
        throw new ToBeImplementedError("Undefined function Transport.p_rawlist");
    }

    p_list() {
        throw new Error("Undefined function Transport.p_list");
    }
    p_newlisturls(cl) {
        /*
        Must be implemented by any list, return a pair of URLS that may be the same, private and public links to the list.
        returns: ( privateurl, publicurl) e.g. yjs:xyz/abc or orbitdb:a123
         */
        throw new Error("undefined function Transport.p_newlisturls");
    }

    //noinspection JSUnusedGlobalSymbols
    p_rawreverse(url) {
        /*
        Similar to p_rawlist, but return the list item of all the places where the object url has been listed.
        The url here corresponds to the "url" parameter of p_rawadd
        Returns a promise that resolves to the list.

        :param string url: String with the url that identifies the object put on a list.
        :resolve array: An array of objects as stored on the list.
         */
        throw new ToBeImplementedError("Undefined function Transport.p_rawreverse");
    }

    listmonitor(url, callback, {current=false}={}) {
        /*
        Setup a callback called whenever an item is added to a list, typically it would be called immediately after a p_rawlist to get any more items not returned by p_rawlist.

        :param url:         string Identifier of list (as used by p_rawlist and "signedby" parameter of p_rawadd
        :param callback:    function(obj)  Callback for each new item added to the list
               	obj is same format as p_rawlist or p_rawreverse
         */
        console.log("Undefined function Transport.listmonitor");    // Note intentionally a log, as legitamte to not implement it
    }


    // ==== TO SUPPORT KEY VALUE INTERFACES IMPLEMENT THESE =====
    // Support for Key-Value pairs as per
    // https://docs.google.com/document/d/1yfmLRqKPxKwB939wIy9sSaa7GKOzM5PrCZ4W1jRGW6M/edit#

    async p_newdatabase(pubkey) {
        /*
         Create a new database based on some existing object
         pubkey:    Something that is, or has a pubkey, by default support Dweb.PublicPrivate, KeyPair or an array of strings as in the output of keypair.publicexport()
         returns: {publicurl, privateurl} which may be the same if there is no write authentication
          */
        throw new ToBeImplementedError("Undefined function Transport.p_newdatabase");
    }
    //TODO maybe change the listmonitor / monitor code for to use "on" and the structure of PP.events
    //TODO but note https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy about Proxy which might be suitable, prob not as doesnt map well to lists
    async p_newtable(pubkey, table) {
        /*
        Create a new table,
        pubkey: Is or has a pubkey (see p_newdatabase)
        table:  String representing the table - unique to the database
        returns:    {privateurl, publicurl} which may be the same if there is no write authentication
         */
        throw new ToBeImplementedError("Undefined function Transport.p_newtable");
    }

    async p_set(url, keyvalues, value) {  // url = yjs:/yjs/database/table/key
        /*
        Set one or more keys in a table.
        url:    URL of the table
        keyvalues:  String representing a single key OR dictionary of keys
        value:  String or other object to be stored (its not defined yet what objects should be supported, e.g. any object ?
         */
        throw new ToBeImplementedError("Undefined function Transport.p_set");
    }
    async p_get(url, keys) {
        /* Get one or more keys from a table
        url:    URL of the table
        keys:   Array of keys
        returns:    Dictionary of values found (undefined if not found)
         */
        throw new ToBeImplementedError("Undefined function Transport.p_get");
    }

    async p_delete(url, keys) {
        /* Delete one or more keys from a table
        url:    URL of the table
        keys:   Array of keys
         */
        throw new ToBeImplementedError("Undefined function Transport.p_delete");
    }

    async p_keys(url) {
        /* Return a list of keys in a table (suitable for iterating through)
        url:    URL of the table
        returns:    Array of strings
         */
        throw new ToBeImplementedError("Undefined function Transport.p_keys");
    }
    async p_getall(url) {
        /* Return a dictionary representing the table
        url:    URL of the table
        returns:    Dictionary of Key:Value pairs, note take care if this could be large.
         */
        throw new ToBeImplementedError("Undefined function Transport.p_keys");
    }


    // Transport
    /*
     * The createReadStream family of methods implement two different interfaces to reading streams
     *
     * For AudioVideo playing there is a function p_f_createReadStream to get a function that is called repeatedly by the AV element
     *
     * For fetching, responding to HTTP queries etc, createReadStream() asynchronously returns a stream.
     *
     * The functions to implement are:
     * createReadStreamID(url) - return an id that can be passed to createReadStreamSync, it can also do things like opening a P2P process etc
     * createReadStreamFetch(id, opts, cb(err, s)) - Inner function that returns a stream that will return a range of bytes
     * createReadStreamFunction(url, opts, cb) - uses createReadStreamID and returns a dynamically created function (below) via promise or callback
     * p_f_createReadStream(url, opts, cb) - promisified version of createReadStreamFunction
     * <anon>(opts) - retrieve bytes (using createReadStreamSync) synchronously
     * createReadStreamSync(id, opts) - synchronously return a pass-through stream, then pipe stream from createReadStreamFetch into it
     * createReadStream(url, opts, cb) - returns a stream to retrieve a range of bytes (via createStreamID & createStreamFetch)
     */

    // Convert a url into an ID
    // By default (e.g. in HTTP) the url is the id, in IPFS its the multihash, in WEBTORRENT its an internal file structure
    createReadStreamID(url, cb) {
        cb(null, url);
    }

    createReadStreamFunction(url, {wanturl=false}={}, cb) {
        /*
        :param string url: URL of object being retrieved of form  magnet:xyzabc/path/to/file  (Where xyzabc is the typical magnet uri contents)
        :param boolean wanturl True if want the URL of the stream (for service workers)
        :resolves to: f({start, end}) => stream (The readable stream.)
        :throws:        TransportError if url invalid - note this happens immediately, not as a catch in the promise
         */
        //Logged by Transports
        //debug("p_f_createreadstream %s", Url.parse(url).href);
        this.createReadStreamID(url, (err, id) => {
            if (err) {
                cb(err);
            } else {
                let self = this;
                cb(null, function (opts) { return self.createReadStreamSync(id, opts); });
            }
        });
    }

  async p_f_createReadStream(url, { wanturl = false } = {}) {
      return new Promise((resolve, reject) => { try { this.createReadStreamFunction.call(this, url, { wanturl }, (err, res) => { if (err) {reject(err)} else {resolve(res)} })} catch(err) {reject(err)}}) // Promisify pattern v2b
  }

    createReadStreamFetch(id, opts, cb) {
        throw(new Error("createReadStreamFetch not defined for "+this.name));
    }

    /**
     * Asynchronously open a stream by url
     * @param url
     * @param opts {start, end}
     * @param cb(err, stream)
     */
    createReadStream(url, opts, cb) {
        waterfall([
            cb1 => this.createReadStreamID(url, cb1),
            (id, cb1) => this.createReadStreamFetch(id, opts, cb1) // cb(err, stream)
        ], cb); //
    }

    createReadStreamSync(id, opts) {
        /*   The function, encapsulated and inside another function by p_f_createReadStream (see docs) */
        debug("createreadstreamSync %o", opts);
        if (!opts.name) opts.name = ""; // For debugging
        let through;
        through = new stream.PassThrough();
        through.name = "XXX THROUGH " +  opts.name;
        // TODO - debug this and figure out why using nested Object.assign
        this.createReadStreamFetch(id, Object.assign({}, opts, { silentFinalError: true } ), (err, s) => {
            if (err) {
                debug("XXX Emitting error on through stream %s", opts.name); // Tracking down obscure timing error where barfs if error emitted before through's consumer sets up its own error handler
                if (!opts.silentFinalError) {
                    debug("ERROR: %s of %s sync_createReadStream caught error %s", this.name, opts.name, err.message);
                }
                if (typeof through.destroy === 'function') {
                    // TODO-STREAMS Seem to have a problem here, if through doesn't have any error handlers. and unclear if its lack of error on "s" or on "through"
                    through.destroy(err); // Will emit error & close and free up resources
                    // caller MUST impliment through.on('error', err=>) or will generate uncaught error message
                } else {
                    through.emit('error', err);
                }
            } else {
                s.name = "XXX TransportHTTP.createReadStream result: " +  opts.name;
                s.pipe(through);
            }
        });
        return through; // Returns "through" synchronously, before the pipe is setup
    }




    // ------ UTILITY FUNCTIONS, NOT REQD TO BE SUBCLASSED ----

    /**
     * Set the status variable and trigger any event listeners
     * @param level
     */
    setStatus(level, {forceSendEvent= false} = {}) {
        const hasChanged = level !== this.status;
        this.status = level;
        if (hasChanged || forceSendEvent) Transports.statusChanged();
    }
    static mergeoptions(a) {
        /*
        Deep merge options dictionaries, careful since searchparameters from URL passed in as null
         */
        let c = {};
        for (let i = 0; i < arguments.length; i++) {
            let b = arguments[i];
            for (let key in b) {
                let val = b[key];
                if (val !== null) {
                    if ((typeof val === "object") && !Array.isArray(val) && c[key]) {
                        c[key] = Transport.mergeoptions(a[key], b[key]);
                    } else {
                        c[key] = b[key];
                    }
                }
            }
        }
        return c;
    }

    async p_test_list({urlexpectedsubstring=undefined}={}) {
        //TODO - this test doesn't work since we dont have Signature nor want to create dependency on it - when works, add to GUN & YJS
        {console.log(this.name,"p_test_kvt")}
        try {
            let table = await this.p_newlisturls("NACL VERIFY:1234567LIST");
            let mapurl = table.publicurl;
            console.log("newlisturls=",mapurl);
            console.assert((!urlexpectedsubstring) || mapurl.includes(urlexpectedsubstring));
            await this.p_rawadd(mapurl, "testvalue");
            let res = await this.p_rawlist(mapurl);
            console.assert(res.length===1 && res[0] === "testvalue");
            await this.p_rawadd(mapurl, {foo: "bar"});   // Try adding an object
            res = await this.p_rawlist(mapurl);
            console.assert(res.length === 2 && res[1].foo === "bar");
            await this.p_rawadd(mapurl, [1,2,3]);    // Try setting to an array
            res = await this.p_rawlist(mapurl);
            console.assert(res.length === 2 && res[2].length === 3 && res[2][1] === 2);
            await delay(200);
            console.log(this.name, "p_test_list complete")
        } catch(err) {
            console.log("Exception thrown in ", this.name, "p_test_list:", err.message);
            throw err;
        }

    }
    async p_test_kvt(urlexpectedsubstring) {
        /*
            Test the KeyValue functionality of any transport that supports it.
            urlexpectedsubstring:   Some string expected in the publicurl of the table.
         */
        {console.log(this.name,"p_test_kvt")}
        try {
            let table = await this.p_newtable("NACL VERIFY:1234567KVT","mytable");
            let mapurl = table.publicurl;
            console.log("newtable=",mapurl);
            console.assert(mapurl.includes(urlexpectedsubstring));
            await this.p_set(mapurl, "testkey", "testvalue");
            let res = await this.p_get(mapurl, "testkey");
            console.assert(res === "testvalue");
            await this.p_set(mapurl, "testkey2", {foo: "bar"});   // Try setting to an object
            res = await this.p_get(mapurl, "testkey2");
            console.assert(res.foo === "bar");
            await this.p_set(mapurl, "testkey3", [1,2,3]);    // Try setting to an array
            res = await this.p_get(mapurl, "testkey3");
            console.assert(res[1] === 2);
            res = await this.p_keys(mapurl);
            console.assert(res.includes("testkey") && res.includes("testkey3") && res.length === 3);
            await this.p_delete(mapurl, ["testkey"]);
            res = await this.p_getall(mapurl);
            console.log("getall=>",res);
            console.assert(res.testkey2.foo === "bar" && res.testkey3["1"] === 2 && !res.testkey);
            await delay(200);
            console.log(this.name, "p_test_kvt complete")
        } catch(err) {
            console.log("Exception thrown in ", this.name, "p_test_kvt:", err.message);
            throw err;
        }
    }


}
Transport.STATUS_CONNECTED = 0; // Connected - all other numbers are some version of not ok to use
Transport.STATUS_FAILED = 1;    // Failed to connect
Transport.STATUS_STARTING = 2;  // In the process of connecting
Transport.STATUS_LOADED = 3;    // Code loaded, but haven't tried to connect. (this is typically hard coded in subclasses constructor)
Transport.STATUS_PAUSED = 4;    // It was launched, probably connected, but now paused so will be ignored by validFor // Note this is copied to dweb-archive/Nav.js so check if change
Transport.STATUSTEXT = ["Connected", "Failed", "Starting", "Loaded", "Paused"];
exports = module.exports = Transport;
