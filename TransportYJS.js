/*
This Transport layers builds on the YJS DB and uses IPFS as its transport.

Y Lists have listeners and generate events - see docs at ...
*/
const Url = require('url');
const debugyjs = require('debug')('dweb-transports:yjs');
const canonicaljson = require('@stratumn/canonicaljson');

//const Y = require('yjs/dist/y.js'); // Explicity require of dist/y.js to get around a webpack warning but causes different error in YJS
const Y = require('yjs'); // Explicity require of dist/y.js to get around a webpack warning
require('y-memory')(Y);
require('y-array')(Y);
require('y-text')(Y);
require('y-map')(Y);
require('y-ipfs-connector')(Y);
require('y-indexeddb')(Y);
//require('y-leveldb')(Y); //- can't be there for browser, node seems to find it ok without this, though not sure why..

// Utility packages (ours) And one-liners
function delay(ms, val) { return new Promise(resolve => {setTimeout(() => { resolve(val); },ms)})}

// Other Dweb modules
const errors = require('./Errors'); // Standard Dweb Errors
const Transport = require('./Transport.js'); // Base class for TransportXyz
const Transports = require('./Transports'); // Manage all Transports that are loaded
const utils = require('./utils'); // Utility functions

let defaultoptions = {
        db: {
            name: 'indexeddb',   // leveldb in node
        },
        connector: {
            name: 'ipfs',
            //ipfs: ipfs,   // Need to link IPFS here once created
        },
};

class TransportYJS extends Transport {
    /*
    YJS specific transport - over IPFS, but could probably use other YJS transports

    Fields: TODO document this
     */

    constructor(options) {
        super(options);
        this.options = options;         // Dictionary of options
        this.name = "YJS";             // For console log etc
        this.supportURLs = ['yjs'];
        this.supportFunctions = ['fetch', 'add', 'list', 'listmonitor', 'newlisturls',
            'connection', 'get', 'set', 'getall', 'keys', 'newdatabase', 'newtable', 'monitor'];   // Only does list functions, Does not support reverse,
        this.supportFeatures = []; // Doesnt support noCache and is mutable
        this.status = Transport.STATUS_LOADED;
    }

    async p__y(url, opts) {
        /*
        Utility function to get Y for this URL with appropriate options and open a new connection if not already

        url:        URL string to find list of
        opts:       Options to add to defaults
        resolves:   Y
        */
        if (!(typeof(url) === "string")) { url = url.href; } // Convert if its a parsed URL
        console.assert(url.startsWith("yjs:/yjs/"));
        try {
            if (this.yarrays[url]) {
                //debugyjs("Found Y for %s", url);
                return this.yarrays[url];
            } else {
                let options = Transport.mergeoptions(this.options, {connector: {room: url}}, opts); // Copies options, ipfs will be set already
                //debugyjs("Creating Y for %s", url);
                return this.yarrays[url] = await Y(options);
            }
        } catch(err) {
            console.error("Failed to initialize Y", err.message);
            throw err;
        }
    }

    async p__yarray(url) {
        /*
        Utility function to get Yarray for this URL and open a new connection if not already
        url:        URL string to find list of
        resolves:   Y
        */
        return this.p__y(url, { share: {array: "Array"}}); // Copies options, ipfs will be set already
    }
    async p_connection(url) {
        /*
        Utility function to get Yarray for this URL and open a new connection if not already
        url:        URL string to find list of
        resolves:   Y - a connection to use for get's etc.
        */
        return this.p__y(url, { share: {map: "Map"}}); // Copies options, ipfs will be set already
    }



    static setup0(options) {
        /*
            First part of setup, create obj, add to Transports but dont attempt to connect, typically called instead of p_setup if want to parallelize connections.
        */
        let combinedoptions = Transport.mergeoptions(defaultoptions, options.yjs);
        debugyjs("YJS options %o", combinedoptions);
        let t = new TransportYJS(combinedoptions);   // Note doesnt start IPFS or Y
        Transports.addtransport(t);
        return t;
    }

    async p_setup2(cb) {
        /*
        This sets up for Y connections, which are opened each time a resource is listed, added to, or listmonitored.
        p_setup2 is defined because IPFS will have started during the p_setup1 phase.
        Throws: Error("websocket error") if WiFi off, probably other errors if fails to connect
        */
        try {
            this.status = Transport.STATUS_STARTING;   // Should display, but probably not refreshed in most case
            if (cb) cb(this);
            this.options.connector.ipfs = Transports.ipfs().ipfs; // Find an IPFS to use (IPFS's should be starting in p_setup1)
            this.yarrays = {};
            await this.p_status();
        } catch(err) {
            console.error(this.name,"failed to start",err);
            this.status = Transport.STATUS_FAILED;
        }
        if (cb) cb(this);
        return this;
    }

    async p_status() {
        /*
        Return a string for the status of a transport. No particular format, but keep it short as it will probably be in a small area of the screen.
        For YJS, its online if IPFS is.
         */
        this.status =  (await this.options.connector.ipfs.isOnline()) ? Transport.STATUS_CONNECTED : Transport.STATUS_FAILED;
        return super.p_status();
    }

    // ======= LISTS ========

    async p_rawlist(url) {
    /*
    Fetch all the objects in a list, these are identified by the url of the public key used for signing.
    (Note this is the 'signedby' parameter of the p_rawadd call, not the 'url' parameter
    Returns a promise that resolves to the list.
    Each item of the list is a dict: {"url": url, "date": date, "signature": signature, "signedby": signedby}
    List items may have other data (e.g. reference ids of underlying transport)

    :param string url: String with the url that identifies the list.
    :resolve array: An array of objects as stored on the list.
     */
        try {
            let y = await this.p__yarray(url);
            let res = y.share.array.toArray();
            // .filter((obj) => (obj.signedby.includes(url))); Cant filter since url is the YJS URL, not the URL of the CL that signed it. (upper layers verify, which filters)
            //Logged by Transports
            //debugyjs("p_rawlist found %o", res);
            return res;
        } catch(err) {
            //Logged by Transports
            // console.log("TransportYJS.p_rawlist failed",err.message);
            throw(err);
        }
    }

    listmonitor(url, callback, {current=false}={}) {
        /*
         Setup a callback called whenever an item is added to a list, typically it would be called immediately after a p_rawlist to get any more items not returned by p_rawlist.

         :param url:         string Identifier of list (as used by p_rawlist and "signedby" parameter of p_rawadd
         :param callback:    function(obj)  Callback for each new item added to the list
                    obj is same format as p_rawlist or p_rawreverse
          */
        let y = this.yarrays[typeof url === "string" ? url : url.href];
        console.assert(y,"Should always exist before calling listmonitor - async call p__yarray(url) to create");
        if (current) {
            y.share.array.toArray.map(callback);
        }
        y.share.array.observe((event) => {
            if (event.type === 'insert') { // Currently ignoring deletions.
                debugyjs('resources inserted %o', event.values);
                //cant filter because url is YJS local, not signer, callback should filter
                //event.values.filter((obj) => obj.signedby.includes(url)).map(callback);
                event.values.map(callback);
            }
        })
    }

    rawreverse() {
        /*
        Similar to p_rawlist, but return the list item of all the places where the object url has been listed.
        The url here corresponds to the "url" parameter of p_rawadd
        Returns a promise that resolves to the list.

        :param string url: String with the url that identifies the object put on a list.
        :resolve array: An array of objects as stored on the list.
         */
        //TODO-REVERSE this needs implementing once list structure on IPFS more certain
        throw new errors.ToBeImplementedError("Undefined function TransportYJS.rawreverse"); }

    async p_rawadd(url, sig) {
        /*
        Store a new list item, it should be stored so that it can be retrieved either by "signedby" (using p_rawlist) or
        by "url" (with p_rawreverse). The underlying transport does not need to guarantee the signature,
        an invalid item on a list should be rejected on higher layers.

        :param string url: String identifying list to post to
        :param Signature sig: Signature object containing at least:
            date - date of signing in ISO format,
            urls - array of urls for the object being signed
            signature - verifiable signature of date+urls
            signedby - urls of public key used for the signature
        :resolve undefined:
        */
        // Logged by Transports
        //debugyjs("TransportYJS.p_rawadd %o %o", url.href, sig);
        console.assert(url && sig.urls.length && sig.signature && sig.signedby.length, "TransportYJS.p_rawadd args", url, sig);
        let value = sig.preflight(Object.assign({}, sig));
        let y = await this.p__yarray(url);
        y.share.array.push([value]);
    }

    p_newlisturls(cl) {
        let  u = cl._publicurls.map(urlstr => Url.parse(urlstr))
            .find(parsedurl =>
                (parsedurl.protocol === "ipfs" && parsedurl.pathname.includes('/ipfs/'))
                || (parsedurl.protocol === "yjs:"));
        if (!u) {
            u = `yjs:/yjs/${ cl.keypair.verifyexportmultihashsha256_58() }`; // Pretty random, but means same test will generate same list
        }
        return [u,u];
    }

    // ======= KEY VALUE TABLES ========

    async p_newdatabase(pubkey) {
        //if (pubkey instanceof Dweb.PublicPrivate)
        if (pubkey.hasOwnProperty("keypair"))
            pubkey = pubkey.keypair.signingexport();
        // By this point pubkey should be an export of a public key of form xyz:abc where xyz
        // specifies the type of public key (NACL VERIFY being the only kind we expect currently)
        let u =  `yjs:/yjs/${encodeURIComponent(pubkey)}`;
        return {"publicurl": u, "privateurl": u};
    }

    //TODO maybe change the listmonitor / monitor code for to use "on" and the structure of PP.events
    //TODO but note https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy about Proxy which might be suitable, prob not as doesnt map well to lists
    async p_newtable(pubkey, table) {
        if (!pubkey) throw new errors.CodingError("p_newtable currently requires a pubkey");
        let database = await this.p_newdatabase(pubkey);
        // If have use cases without a database, then call p_newdatabase first
        return { privateurl: `${database.privateurl}/${table}`,  publicurl: `${database.publicurl}/${table}`}  // No action required to create it
    }

    async p_set(url, keyvalues, value) {  // url = yjs:/yjs/database/table
        /*
        Set key values
        keyvalues:  string (key) in which case value should be set there OR
                object in which case value is ignored
         */
        let y = await this.p_connection(url);
        if (typeof keyvalues === "string") {
            y.share.map.set(keyvalues, canonicaljson.stringify(value));
        } else {
            Object.keys(keyvalues).map((key) => y.share.map.set(key, keyvalues[key]));
        }
    }
    _p_get(y, keys) {
        if (Array.isArray(keys)) {
            return keys.reduce(function(previous, key) {
                let val = y.share.map.get(key);
                previous[key] = typeof val === "string" ? JSON.parse(val) : val;    // Handle undefined
                return previous;
            }, {});
        } else {
            let val = y.share.map.get(keys);
            return typeof val === "string" ? JSON.parse(val) : val;  // Surprisingly this is sync, the p_connection should have synchronised
        }
    }
    async p_get(url, keys) {
        return this._p_get(await this.p_connection(url), keys);
    }

    async p_delete(url, keys) {
        let y = await this.p_connection(url);
        if (typeof keys === "string") {
            y.share.map.delete(keys);
        } else {
            keys.map((key) => y.share.map.delete(key));  // Surprisingly this is sync, the p_connection should have synchronised
        }
    }

    async p_keys(url) {
        let y = await this.p_connection(url);
        return y.share.map.keys();   // Surprisingly this is sync, the p_connection should have synchronised
    }
    async p_getall(url) {
        let y = await this.p_connection(url);
        let keys = y.share.map.keys();   // Surprisingly this is sync, the p_connection should have synchronised
        return this._p_get(y, keys);
    }
    async p_rawfetch(url) {
        return { // See identical structure in TransportHTTP
            table: "keyvaluetable",         //TODO-KEYVALUE its unclear if this is the best way, as maybe want to know the real type of table e.g. domain
            _map: await this.p_getall(url)
        };   // Data struc is ok as SmartDict.p_fetch will pass to KVT constructor
    }
    async monitor(url, callback, {current=false}={}) {
        /*
         Setup a callback called whenever an item is added to a list, typically it would be called immediately after a p_getall to get any more items not returned by p_getall.
         Stack: KVT()|KVT.p_new => KVT.monitor => (a: Transports.monitor => YJS.monitor)(b: dispatchEvent)

         :param url:         string Identifier of list (as used by p_rawlist and "signedby" parameter of p_rawadd
         :param callback:    function({type, key, value})  Callback for each new item added to the list

         :param current:     boolean - true if want events for current items on table
          */
        url = typeof url === "string" ? url : url.href;
        let y = this.yarrays[url];
        if (!y) {
            throw new errors.CodingError("Should always exist before calling monitor - async call p__yarray(url) to create");
        }
        if (current) {
            // Iterate over existing items with callback
            y.share.map.keys()
                .forEach(k => {
                    let val = y.share.map.get[k];
                    callback({type: "set", key: k, value: (typeof val === "string" ? JSON.parse(val) : val)});
                })
        }
        y.share.map.observe((event) => {
            if (['add','update'].includes(event.type)) { // Currently ignoring deletions.
                debugyjs("YJS monitor: %o %s %s %o", url, event.type, event.name, event.value);
                // ignores event.path (only in observeDeep) and event.object
                if (!(event.type === "update" && event.oldValue === event.value)) {
                    // Dont trigger on update as seeing some loops with p_set
                    let newevent = {
                        "type": {"add": "set", "update": "set", "delete": "delete"}[event.type],
                        "value": JSON.parse(event.value),
                        "key": event.name,
                    };
                    callback(newevent);
                }
            }
        })
    }

    static async p_test(opts={}) {
        {console.log("TransportHTTP.test")}
        try {
            let transport = await this.p_setup(opts);
            console.log("HTTP connected");
            let res = await transport.p_info();
            console.log("TransportHTTP info=",res);
            res = await transport.p_status();
            console.assert(res === Transport.STATUS_CONNECTED);
            await transport.p_test_kvt("NACL%20VERIFY");
        } catch(err) {
            console.log("Exception thrown in TransportHTTP.test:", err.message);
            throw err;
        }
    }



}
TransportYJS.Y = Y; // Allow node tests to find it
Transports._transportclasses["YJS"] = TransportYJS;
exports = module.exports = TransportYJS;
