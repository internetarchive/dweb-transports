/*
This Transport layers uses GUN.
*/
const Url = require('url');
process.env.GUN_ENV = "false";
const Gun = require('gun/gun.js');  // TODO-GUN switchback to gun/gun at some point to get minimized version
require('gun/lib/path.js');

// Other Dweb modules
const errors = require('./Errors'); // Standard Dweb Errors
const Transport = require('./Transport.js'); // Base class for TransportXyz
const Transports = require('./Transports'); // Manage all Transports that are loaded
const utils = require('./utils'); // Utility functions

// Utility packages (ours) And one-liners
//unused currently: function delay(ms, val) { return new Promise(resolve => {setTimeout(() => { resolve(val); },ms)})}

let defaultoptions = {
    peers: [ "http://dweb.me:4246/gun" ]   // TODO-GUN get server setup and then replace this URL
    //localstore: true                     #True is default
};
//To run a superpeer - cd wherever; node install gun; cd node_modules/gun; npm start - starts server by default on port 8080, or set an "env" - see http.js
//setenv GUN_ENV false; node examples/http.js 4246
//Make sure to open of the port (typically in /etc/ferm)
//TODO-GUN - figure out how to make server persistent - started by systemctl etc and incorporate in dweb-gateway/scripts/install.sh

/*
    WORKING AROUND GUN WEIRNESS/SUBOPTIMAL

    .once() and possibly .on() send an extra GUN internal field "_" which needs filtering. Reported and hopefully will get fixed, for now see other TODO-GUN-UNDERSCORE for the workaround
    .once() and .on() deliver existing values as well as changes, reported & hopefully will get way to find just new ones. for now, see other TODO-GUN-CURRENT for the workaround
    There is no way to delete an item, setting it to null is recorded and is by convention a deletion. BUT the field will still show up in .once and .on, see other TODO-GUN-DELETE for the workaround
    GUN is not promisified, there is only one place we care, and that is .once (since .on is called multiple times). See TODO-GUN-PROMISES for workaround
 */

class TransportGUN extends Transport {
    /*
    GUN specific transport - over IPFS

    Fields:
    gun: object returned when starting GUN
     */

    constructor(options, verbose) {
        super(options, verbose);
        this.options = options;         // Dictionary of options
        this.gun = undefined;
        this.name = "GUN";          // For console log etc
        this.supportURLs = ['gun'];
        this.supportFunctions = ['connection', 'get', 'set', 'getall', 'keys', 'newdatabase', 'newtable', 'monitor',
                                 'add', 'list', 'listmonitor', 'newlisturls']
        this.status = Transport.STATUS_LOADED;
    }

    connection(url, verbose) {
        /*
        Utility function to get Gun object for this URL (note this isn't async)
        url:        URL string to find list of
        resolves:   Gun a connection to use for get's etc, undefined if fails
        */
        if (typeof url === "string")
            url = Url.parse(url);
        let patharray = url.pathname.split('/');   //[ 'gun', database, table ]
        patharray.shift();  // Loose leading ""
        patharray.shift();    // Loose "gun"
        if (verbose) console.log("Path=", patharray);
        return this.gun.path(patharray);           // Not sure how this could become undefined as it will return g before the path is walked, but if do a lookup on this "g" then should get undefined
    }

    static setup0(options, verbose) {
        /*
            First part of setup, create obj, add to Transports but dont attempt to connect, typically called instead of p_setup if want to parallelize connections.
            options: { gun: { }, }   Set of options - "gun" is used for those to pass direct to Gun
        */
        let combinedoptions = Transport.mergeoptions(defaultoptions, options.gun);
        console.log("GUN options %o", combinedoptions); // Log even if !verbose
        let t = new TransportGUN(combinedoptions, verbose);     // Note doesnt start IPFS or OrbitDB
        t.gun = new Gun(t.options.gun);                         // This doesnt connect, just creates db structure
        Transports.addtransport(t);
        return t;
    }

    async p_setup1(verbose, cb) {
        /*
        This sets up for GUN.
        Throws: TODO-GUN-DOC document possible error behavior
        */
        try {
            this.status = Transport.STATUS_STARTING;   // Should display, but probably not refreshed in most case
            if (cb) cb(this);
            //TODO-GUN-TEST - try connect and retrieve info then look at ._.opt.peers
            await this.p_status(verbose);
        } catch(err) {
            console.error(this.name,"failed to start",err);
            this.status = Transport.STATUS_FAILED;
        }
        if (cb) cb(this);
        return this;
    }

    async p_status(verbose) {
        /*
        Return an integer for the status of a transport see Transport
         */
        //TODO-GUN-TEST - try connect and retrieve info then look at ._.opt.peers
        this.status = Transport.STATUS_CONNECTED;  //TODO-GUN how do I know if/when I'm connected (see comment on p_setup1 as well)
        return this.status;
    }
    // ===== LISTS ========

    // noinspection JSCheckFunctionSignatures
    async p_rawlist(url, {verbose=false}={}) {
    /*
    Fetch all the objects in a list, these are identified by the url of the public key used for signing.
    (Note this is the 'signedby' parameter of the p_rawadd call, not the 'url' parameter
    Returns a promise that resolves to the list.
    Each item of the list is a dict: {"url": url, "date": date, "signature": signature, "signedby": signedby}
    List items may have other data (e.g. reference ids of underlying transport)

    :param string url: String with the url that identifies the list.
    :param boolean verbose: true for debugging output
    :resolve array: An array of objects as stored on the list.
     */
        try {
            let g = this.connection(url, verbose);
            let data = await this._p_once(g);
            let res = data ? Object.keys(data).filter(k => k !== '_').sort().map(k => data[k]) : []; //See TODO-GUN-UNDERSCORE
            // .filter((obj) => (obj.signedby.includes(url))); // upper layers verify, which filters
            if (verbose) console.log("GUN.p_rawlist found", ...utils.consolearr(res));
            return res;
        } catch(err) {
            console.log("TransportGUN.p_rawlist failed",err.message);
            throw(err);
        }
    }

    listmonitor(url, callback, {verbose=false, current=false}={}) {
        /*
         Setup a callback called whenever an item is added to a list, typically it would be called immediately after a p_rawlist to get any more items not returned by p_rawlist.

         url:       string Identifier of list (as used by p_rawlist and "signedby" parameter of p_rawadd
         callback:  function(obj)  Callback for each new item added to the list
                        obj is same format as p_rawlist or p_rawreverse
         current    true if should send list of existing elements
         verbose:   true for debugging output
          */
        let g = this.connection(url, verbose);
        if (!current) { // See TODO-GUN-CURRENT have to keep an extra copy to compare for which calls are new.
            g.once(data => {
                this.monitored = data || []; //  Keep a copy - could actually just keep high water mark unless getting partial knowledge of state of array.
                g.map().on((v, k) => {
                    if ((v !== this.monitored[k]) && (k !== '_')) { //See TODO-GUN-UNDERSCORE
                        this.monitored[k] = v;
                        callback(JSON.parse(v));
                    }
                });
            });
        } else {
            g.map().on((v, k) => callback("set", k, JSON.parse(v)));
        }
    }

    // noinspection JSCheckFunctionSignatures
    async p_rawadd(url, sig, {verbose=false}={}) {
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
        :param boolean verbose: true for debugging output
        :resolve undefined:
        */
        // noinspection JSUnresolvedVariable
        console.assert(url && sig.urls.length && sig.signature && sig.signedby.length, "TransportGUN.p_rawadd args", url, sig);
        if (verbose) console.log("TransportGUN.p_rawadd", typeof url === "string" ? url : url.href, sig);
        this.connection(url, verbose)
        .set( JSON.stringify( sig.preflight( Object.assign({}, sig))));
    }

    // noinspection JSCheckFunctionSignatures
    async p_newlisturls(cl, {verbose=false}={}) {
        let u = await this._p_newgun(cl, {verbose});
        return [ u, u];
    }

    //=======KEY VALUE TABLES ========

    // noinspection JSMethodCanBeStatic
    async _p_newgun(pubkey, {verbose=false}={}) {
        if (pubkey.hasOwnProperty("keypair"))
            pubkey = pubkey.keypair.signingexport();
        // By this point pubkey should be an export of a public key of form xyz:abc where xyz
        // specifies the type of public key (NACL VERIFY being the only kind we expect currently)
        return `gun:/gun/${encodeURIComponent(pubkey)}`;
    }
    async p_newdatabase(pubkey, {verbose=false}={}) {
        /*
        Request a new database
        For GUN it doesnt actually create anything, just generates the URLs
        TODO-GUN simple version first - userid based on my keypair first, then switch to Gun's userid and its keypair
        Include gun/sea.js; user.create(<alias>,<passphrase>); user.auth(<alias>,<passphrase>); # See gun.eco/docs/Auth

        returns: {publicurl: "gun:/gun/<publickey>", privateurl:  "gun:/gun/<publickey>">
        */
        let u = await this._p_newgun(pubkey, {verbose});
        return {publicurl: u, privateurl: u};
    }

    async p_newtable(pubkey, table, {verbose=false}={}) {
        /*
        Request a new table
        For GUN it doesnt actually create anything, just generates the URLs

        returns: {publicurl: "gun:/gun/<publickey>/<table>", privateurl:  "gun:/gun/<publickey>/<table>">
        */
        if (!pubkey) throw new errors.CodingError("p_newtable currently requires a pubkey");
        let database = await this.p_newdatabase(pubkey, {verbose});
        // If have use cases without a database, then call p_newdatabase first
        return { privateurl: `${database.privateurl}/${table}`,  publicurl: `${database.publicurl}/${table}`}  // No action required to create it
    }

    async p_set(url, keyvalues, value, {verbose=false}={}) {  // url = yjs:/yjs/database/table
        /*
        Set key values
        keyvalues:  string (key) in which case value should be set there OR
                object in which case value is ignored
         */
        let table = this.connection(url, verbose);
        if (typeof keyvalues === "string") {
            table.path(keyvalues).put(JSON.stringify(value));
        } else {
            // Store all key-value pairs without destroying any other key/value pairs previously set
            console.assert(!Array.isArray(keyvalues), "TransportGUN - shouldnt be passsing an array as the keyvalues");
            table.put(
                Object.keys(keyvalues).reduce(
                    function(previous, key) { previous[key] = JSON.stringify(keyvalues[key]); return previous; },
                    {}
            ))
        }
    }

    async p_get(url, keys, {verbose=false}={}) {
        let table = this.connection(url, verbose);
        if (Array.isArray(keys)) {
            throw new errors.ToBeImplementedError("p_get(url, [keys]) isn't supported - because of ambiguity better to explicitly loop on set of keys or use getall and filter");
            /*
            return keys.reduce(function(previous, key) {
                let val = table.get(key);
                previous[key] = typeof val === "string" ? JSON.parse(val) : val;    // Handle undefined
                return previous;
            }, {});
            */
        } else {
            let val = await this._p_once(table.get(keys));    // Resolves to value
            return typeof val === "string" ? JSON.parse(val) : val;  // This looks like it is sync
        }
    }

    async p_delete(url, keys, {verbose=false}={}) {
        let table = this.connection(url, verbose);
        if (typeof keys === "string") {
            table.path(keys).put(null);
        } else {
            keys.map((key) => table.path(key).put(null));  // This looks like it is sync
        }
    }

    //TODO-GUN-PROMISE suggest p_once as a good single addition
    _p_once(gun) {  // Npte in some cases (e.g. p_getall) this will resolve to a object, others a string/number (p_get)
        return new Promise((resolve, reject) => gun.once(resolve));
    }

    async p_keys(url, {verbose=false}={}) {
        let res = await this._p_once(this.connection(url, verbose));
        return Object.keys(res)
            .filter(k=> (k !== '_') && (res[k] !== null)); //See TODO-GUN-UNDERSCORE and TODO-GUN-DELETE
    }

    async p_getall(url, {verbose=false}={}) {
        let res = await this._p_once(this.connection(url, verbose));
        return Object.keys(res)
            .filter(k=> (k !== '_') && res[k] !== null) //See TODO-GUN-UNDERSCORE and TODO-GUN-DELETE
            .reduce( function(previous, key) { previous[key] = JSON.parse(res[key]); return previous; }, {});
    }

    async monitor(url, callback, {verbose=false, current=false}={}) {
        /*
         Setup a callback called whenever an item is added to a list, typically it would be called immediately after a p_getall to get any more items not returned by p_getall.
         Stack: KVT()|KVT.p_new => KVT.monitor => (a: Transports.monitor => GUN.monitor)(b: dispatchEvent)

         url:         string Identifier of list (as used by p_rawlist and "signedby" parameter of p_rawadd
         callback:    function({type, key, value})  Callback for each new item added to the list (type = "set"|"delete")

         verbose:     boolean - true for debugging output
         current            Send existing items to the callback as well
          */
        let g = this.connection(url, verbose);
        if (!current) { // See TODO-GUN-CURRENT have to keep an extra copy to compare for which calls are new.
            g.once(data => this.monitored = data); // Keep a copy
            g.map().on((v, k) => {
                if (v !== this.monitored[k]) {
                    this.monitored[k] = v;
                    callback("set", k, JSON.parse(v));
                }
            });
        } else {
            g.map().on((v, k) => callback("set", k, JSON.parse(v)));
        }
    }

    static async p_test(verbose) {
        if (verbose) {console.log("TransportGUN.test")}
        try {
            let t = this.setup0({}, verbose);   //TODO-GUN when works with peers commented out, try passing peers: []
            await t.p_setup1(verbose); // Not passing cb yet
            await t.p_setup2(verbose); // Not passing cb yet - this one does nothing on GUN
            // noinspection JSIgnoredPromiseFromCall
            t.p_test_kvt("gun:/gun/NACL", {verbose});
            //t.p_test_list("gun:/gun/NACL", {verbose}); //TODO test_list needs fixing to not create a dependency on Signature
        } catch(err) {
            console.log("Exception thrown in TransportGUN.test:", err.message);
            throw err;
        }
    }

    static async demo_bugs() {
        let gun = new Gun();
        gun.get('foo').get('bar').put('baz');
        console.log("Expect {bar: 'baz'} but get {_:..., bar: 'baz'}");
        gun.get('foo').once(data => console.log(data));
        gun.get('zip').get('bar').set('alice');
        console.log("Expect {12345: 'alice'} but get {_:..., 12345: 'alice'}");
        gun.get('foo').once(data => console.log(data));
        // Returns extra "_" field
    }
}
Transports._transportclasses["GUN"] = TransportGUN;
exports = module.exports = TransportGUN;
