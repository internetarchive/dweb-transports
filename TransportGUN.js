/*
This Transport layers uses GUN.

See https://github.com/internetarchive/dweb-mirror/issues/43 for meta issue
*/
const Url = require('url');
process.env.GUN_ENV = "false";
const Gun = require('gun/gun.js');  // TODO-GUN switchback to gun/gun at some point to get minimized version
// Raw Gun has almost nothing in it, it needs at least the following to work properly.
require('gun/lib/path.js');         // So that .path works
/*
WORKAROUND-GUN-STORAGE
// The next step is to stop it failing as soon as its cached 5Mb in localstorage
// see https://github.com/amark/gun/blob/master/test/tmp/indexedDB.html and https://github.com/amark/gun/issues/590
// but the instructions on how to do this are obviously broken so waiting on @amark to get this working.
require('gun/lib/radix.js');
require('gun/lib/radisk.js');
require('gun/lib/store.js');
require('gun/lib/rindexed.js');
*/
const debuggun = require('debug')('dweb-transports:gun');
const stringify = require('canonical-json');


// Other Dweb modules
const errors = require('./Errors'); // Standard Dweb Errors
const Transport = require('./Transport.js'); // Base class for TransportXyz
const Transports = require('./Transports'); // Manage all Transports that are loaded
const utils = require('./utils'); // Utility functions

// Utility packages (ours) And one-liners
//unused currently: function delay(ms, val) { return new Promise(resolve => {setTimeout(() => { resolve(val); },ms)})}

let defaultoptions = {
    peers: [ "https://dweb.me:4246/gun" ]
    //localstore: true                     #True is default TODO-GUN check if false turns it off, or defaults to a different store.
};
//To run a superpeer - cd wherever; node install gun; cd node_modules/gun; npm start - starts server by default on port 8080, or set an "env" - see http.js
//setenv GUN_ENV false; node examples/http.js 4246
//Make sure to open of the port (typically in /etc/ferm)
// TODO-GUN - copy example from systemctl here

/*
    WORKING AROUND GUN WEIRDNESS/SUBOPTIMAL (of course, whats weird/sub-optimal to me, might be ideal to someone else) - search the code to see where worked around

    WORKAROUND-GUN-UNDERSCORE .once() and possibly .on() send an extra GUN internal field "_" which needs filtering. Reported and hopefully will get fixed
    .once behaves differently on node or the browser - this is a bug https://github.com/amark/gun/issues/586 and for now this code doesnt work on Node
    WORKAROUND-GUN-CURRENT: .once() and .on() deliver existing values as well as changes, reported & hopefully will get way to find just new ones.
    WORKAROUND-GUN-DELETE:  There is no way to delete an item, setting it to null is recorded and is by convention a deletion. BUT the field will still show up in .once and .on,
    WORKAROUND-GUN-PROMISES: GUN is not promisified, there is only one place we care, and that is .once (since .on is called multiple times).
    WORKAROUND-GUN-ERRORS: GUN does an unhelpful job with errors, for example returning undefined when it cant find something (e.g. if connection to superpeer is down),
        for now just throw an error on undefined
    WORKAROUND-GUN-STORAGE: GUN defaults to local storage, which then fails on 5Mb or more of data, need to use radix, which has to be included and has bizarre config requirement I can't figure out
    TODO-GUN, handle error callbacks which are available in put etc
    Errors and Promises: Note that GUN's use of promises is seriously uexpected (aka weird), see https://gun.eco/docs/SEA#errors
        instead of using .reject or throwing an error at async it puts the error in SEA.err, so how that works in async parallel context is anyone's guess
 */

class TransportGUN extends Transport {
    /*
    GUN specific transport - over IPFS

    Fields:
    gun: object returned when starting GUN
     */

    constructor(options) {
        super(options);
        this.options = options;         // Dictionary of options
        this.gun = undefined;
        this.name = "GUN";          // For console log etc
        this.supportURLs = ['gun'];
        this.supportFunctions = [ 'fetch', //'store'
                                 'connection', 'get', 'set', 'getall', 'keys', 'newdatabase', 'newtable', 'monitor',
                                 'add', 'list', 'listmonitor', 'newlisturls'];
        this.status = Transport.STATUS_LOADED;
    }

    connection(url) {
        /*
        TODO-GUN need to determine what a "rooted" Url is in gun, is it specific to a superpeer for example
        Utility function to get Gun object for this URL (note this isn't async)
        url:        URL string or structure, to find list of of form [gun|dweb]:/gun/<database>/<table>[/<key]  but could be arbitrary gun path
        resolves:   Gun a connection to use for get's etc, undefined if fails
        */
        url = Url.parse(url); // Accept string or Url structure
        let patharray = url.pathname.split('/');   //[ 'gun', database, table ] but could be arbitrary length path
        patharray.shift();  // Loose leading ""
        patharray.shift();    // Loose "gun"
        debuggun("path=", patharray);
        return this.gun.path(patharray);           // Not sure how this could become undefined as it will return g before the path is walked, but if do a lookup on this "g" then should get undefined
    }

    static setup0(options) {
        /*
            First part of setup, create obj, add to Transports but dont attempt to connect, typically called instead of p_setup if want to parallelize connections.
            options: { gun: { }, }   Set of options - "gun" is used for those to pass direct to Gun
        */
        let combinedoptions = Transport.mergeoptions(defaultoptions, options.gun);
        debuggun("options %o", combinedoptions);
        let t = new TransportGUN(combinedoptions);     // Note doesnt start IPFS or OrbitDB
        t.gun = new Gun(t.options);                         // This doesnt connect, just creates db structure
        Transports.addtransport(t);
        return t;
    }

    async p_setup1(cb) {
        /*
        This sets up for GUN.
        Throws: TODO-GUN-DOC document possible error behavior
        */
        try {
            this.status = Transport.STATUS_STARTING;   // Should display, but probably not refreshed in most case
            if (cb) cb(this);
            //TODO-GUN-TEST - try connect and retrieve info then look at ._.opt.peers
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
        Return an integer for the status of a transport see Transport
         */
        //TODO-GUN-TEST - try connect and retrieve info then look at ._.opt.peers
        this.status = Transport.STATUS_CONNECTED;  //TODO-GUN how do I know if/when I'm connected (see comment on p_setup1 as well)
        return this.status;
    }
    // ===== DATA ======

    async p_rawfetch(url) {
        url = Url.parse(url);   // Accept url as string or object
        let g = this.connection(url); // Goes all the way to the key
        let val = await this._p_once(g);
        //g.on((data)=>debuggun("Got late result of: %o", data)); // Checking for bug in GUN issue#586 - ignoring result
        if (!val) throw new errors.TransportError("GUN unable to retrieve: "+url.href);  // WORKAROUND-GUN-ERRORS - gun doesnt throw errors when it cant find something
        let o = typeof val === "string" ? JSON.parse(val) : val;  // This looks like it is sync (see same code on p_get and p_rawfetch)
        //TODO-GUN this is a hack because the metadata such as metadata/audio is getting cached in GUN and in this case is wrong.
        if (o.metadata && o.metadata.thumbnaillinks && o.metadata.thumbnaillinks.find(t => t.includes('ipfs/zb2'))) {
            throw new errors.TransportError("GUN retrieving legacy data at: "+url.href)
        }
        return o;
    }


    // ===== LISTS ========

    // noinspection JSCheckFunctionSignatures
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
            let g = this.connection(url);
            let data = await this._p_once(g);
            let res = data ? Object.keys(data).filter(k => k !== '_').sort().map(k => data[k]) : []; //See WORKAROUND-GUN-UNDERSCORE
            // .filter((obj) => (obj.signedby.includes(url))); // upper layers verify, which filters
            debuggun("p_rawlist found", ...utils.consolearr(res));
            return res;
        } catch(err) {
            // Will be logged by Transports
            throw(err);
        }
    }

    listmonitor(url, callback, {current=false}={}) {
        /*
         Setup a callback called whenever an item is added to a list, typically it would be called immediately after a p_rawlist to get any more items not returned by p_rawlist.

         url:       string Identifier of list (as used by p_rawlist and "signedby" parameter of p_rawadd
         callback:  function(obj)  Callback for each new item added to the list
                        obj is same format as p_rawlist or p_rawreverse
         current    true if should send list of existing elements
          */
        let g = this.connection(url);
        if (!current) { // See WORKAROUND-GUN-CURRENT have to keep an extra copy to compare for which calls are new.
            g.once(data => {
                this.monitored = data ? Object.keys(data) : []; //  Keep a copy - could actually just keep high water mark unless getting partial knowledge of state of array.
                g.map().on((v, k) => {
                    if (!(this.monitored.includes(k)) && (k !== '_')) { //See WORKAROUND-GUN-UNDERSCORE
                        this.monitored.push(k);
                        callback(JSON.parse(v));
                    }
                });
            });
        } else {
            g.map().on((v, k) => callback("set", k, JSON.parse(v)));
        }
    }

    // noinspection JSCheckFunctionSignatures
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
        // noinspection JSUnresolvedVariable
        // Logged by Transports
        console.assert(url && sig.urls.length && sig.signature && sig.signedby.length, "TransportGUN.p_rawadd args", url, sig);
        this.connection(url)
        .set( stringify( sig.preflight( Object.assign({}, sig))));
    }

    // noinspection JSCheckFunctionSignatures
    async p_newlisturls(cl) {
        let u = await this._p_newgun(cl);
        return [ u, u];
    }

    //=======KEY VALUE TABLES ========

    // noinspection JSMethodCanBeStatic
    async _p_newgun(pubkey) {
        if (pubkey.hasOwnProperty("keypair"))
            pubkey = pubkey.keypair.signingexport();
        // By this point pubkey should be an export of a public key of form xyz:abc where xyz
        // specifies the type of public key (NACL VERIFY being the only kind we expect currently)
        return `gun:/gun/${encodeURIComponent(pubkey)}`;
    }
    async p_newdatabase(pubkey) {
        /*
        Request a new database
        For GUN it doesnt actually create anything, just generates the URLs
        TODO-GUN simple version first - userid based on my keypair first, then switch to Gun's userid and its keypair
        Include gun/sea.js; user.create(<alias>,<passphrase>); user.auth(<alias>,<passphrase>); # See gun.eco/docs/Auth

        returns: {publicurl: "gun:/gun/<publickey>", privateurl:  "gun:/gun/<publickey>">
        */
        let u = await this._p_newgun(pubkey);
        return {publicurl: u, privateurl: u};
    }

    async p_newtable(pubkey, table) {
        /*
        Request a new table
        For GUN it doesnt actually create anything, just generates the URLs

        returns: {publicurl: "gun:/gun/<publickey>/<table>", privateurl:  "gun:/gun/<publickey>/<table>">
        */
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
        let table = this.connection(url);
        if (typeof keyvalues === "string") {
            table.path(keyvalues).put(stringify(value));
        } else {
            // Store all key-value pairs without destroying any other key/value pairs previously set
            console.assert(!Array.isArray(keyvalues), "TransportGUN - shouldnt be passsing an array as the keyvalues");
            table.put(
                Object.keys(keyvalues).reduce(
                    function(previous, key) { previous[key] = stringify(keyvalues[key]); return previous; },
                    {}
            ))
        }
    }

    async p_get(url, keys) {
        let table = this.connection(url);
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
            return typeof val === "string" ? JSON.parse(val) : val;  // This looks like it is sync (see same code on p_get and p_rawfetch)
        }
    }

    async p_delete(url, keys) {
        let table = this.connection(url);
        if (typeof keys === "string") {
            table.path(keys).put(null);
        } else {
            keys.map((key) => table.path(key).put(null));  // This looks like it is sync
        }
    }

    //WORKAROUND-GUN-PROMISE suggest p_once as a good single addition
    //TODO-GUN expand this to workaround Gun weirdness with errors.
    _p_once(gun) {  // Note in some cases (e.g. p_getall) this will resolve to a object, others a string/number (p_get)
        return new Promise((resolve) => gun.once(resolve));
    }

    async p_keys(url) {
        let res = await this._p_once(this.connection(url));
        return Object.keys(res)
            .filter(k=> (k !== '_') && (res[k] !== null)); //See WORKAROUND-GUN-UNDERSCORE and WORKAROUND-GUN-DELETE
    }

    async p_getall(url) {
        let res = await this._p_once(this.connection(url));
        return Object.keys(res)
            .filter(k=> (k !== '_') && res[k] !== null) //See WORKAROUND-GUN-UNDERSCORE and WORKAROUND-GUN-DELETE
            .reduce( function(previous, key) { previous[key] = JSON.parse(res[key]); return previous; }, {});
    }

    async monitor(url, callback, {current=false}={}) {
        /*
         Setup a callback called whenever an item is added to a list, typically it would be called immediately after a p_getall to get any more items not returned by p_getall.
         Stack: KVT()|KVT.p_new => KVT.monitor => (a: Transports.monitor => GUN.monitor)(b: dispatchEvent)

         url:         string Identifier of list (as used by p_rawlist and "signedby" parameter of p_rawadd
         callback:    function({type, key, value})  Callback for each new item added to the list (type = "set"|"delete")
         current            Send existing items to the callback as well
          */
        let g = this.connection(url);
        if (!current) { // See WORKAROUND-GUN-CURRENT have to keep an extra copy to compare for which calls are new.
            g.once(data => {
                this.monitored = Object.assign({},data); //  Make a copy of data (this.monitored = data won't work as just points at same structure)
                g.map().on((v, k) => {
                    if ((v !== this.monitored[k]) && (k !== '_')) { //See WORKAROUND-GUN-UNDERSCORE
                        this.monitored[k] = v;
                        callback("set", k, JSON.parse(v));
                    }
                });
            });
        } else {
            g.map().on((v, k) => callback("set", k, JSON.parse(v)));
        }
    }

    static async p_test() {
        debuggun("p_test");
        try {
            let t = this.setup0({});   //TODO-GUN when works with peers commented out, try passing peers: []
            await t.p_setup1(); // Not passing cb yet
            await t.p_setup2(); // Not passing cb yet - this one does nothing on GUN
            // noinspection JSIgnoredPromiseFromCall
            t.p_test_kvt("gun:/gun/NACL");
            //t.p_test_list("gun:/gun/NACL"); //TODO test_list needs fixing to not create a dependency on Signature
        } catch(err) {
            console.warn("Exception thrown in TransportGUN.test:", err.message);
            throw err;
        }
    }

    // noinspection JSUnusedGlobalSymbols
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
