const Transport = require('./Transport'); // Base class for TransportXyz
const Transports = require('./Transports'); // Manage all Transports that are loaded
const httptools = require('./httptools'); // Expose some of the httptools so that IPFS can use it as a backup
const Url = require('url');


defaulthttpoptions = {
    urlbase: 'https://dweb.me:443'
};

servercommands = {  // What the server wants to see to return each of these
    rawfetch: "contenthash",   // was content/rawfetch which should still work.
    rawstore: "contenturl/rawstore",
    rawadd: "void/rawadd",
    rawlist: "metadata/rawlist",
    get:    "get/table",
    set:    "set/table",
    delete: "delete/table",
    keys:    "keys/table",
    getall:    "getall/table"
};


class TransportHTTP extends Transport {

    constructor(options, verbose) {
        super(options, verbose);
        this.options = options;
        this.urlbase = options.http.urlbase;
        this.supportURLs = ['contenthash', 'http','https'];
        this.supportFunctions = ['fetch', 'store', 'add', 'list', 'reverse', 'newlisturls', "get", "set", "keys", "getall", "delete", "newtable", "newdatabase"]; //Does not support: listmonitor - reverse is disabled somewhere not sure if here or caller
        this.supportFeatures = ['fetch.range']
        this.name = "HTTP";             // For console log etc
        this.status = Transport.STATUS_LOADED;
    }

    static setup0(options, verbose) {
        let combinedoptions = Transport.mergeoptions({ http: defaulthttpoptions },options);
        try {
            let t = new TransportHTTP(combinedoptions, verbose);
            Transports.addtransport(t);
            return t;
        } catch (err) {
            console.log("Exception thrown in TransportHTTP.p_setup", err.message);
            throw err;
        }
    }
    async p_setup1(verbose, cb) {
        this.status = Transport.STATUS_STARTING;
        if (cb) cb(this);
        await this.p_status(verbose);
        if (cb) cb(this);
        return this;
    }

    async p_status(verbose) {
        /*
        Return a numeric code for the status of a transport.
         */
        try {
            this.info = await this.p_info(verbose);
            this.status = Transport.STATUS_CONNECTED;
        } catch(err) {
            console.log(this.name, ": Error in p_status.info",err.message);
            this.status = Transport.STATUS_FAILED;
        }
        return super.p_status(verbose);
    }

    _cmdurl(command) {
        return  `${this.urlbase}/${command}`
    }
    _url(url, command, parmstr) {
        if (!url) throw new errors.CodingError(`${command}: requires url`);
        if (typeof url !== "string") { url = url.href }
        url = url.replace('contenthash:/contenthash', this._cmdurl(command)) ;   // Note leaves http: and https: urls unchanged
        url = url.replace('getall/table', command);
        url = url + (parmstr ? "?"+parmstr : "");
        return url;
    }
    async p_rawfetch(url, opts={}) {
        /*
        Fetch from underlying transport,
        Fetch is used both for contenthash requests and table as when passed to SmartDict.p_fetch may not know what we have
        url: Of resource - which is turned into the HTTP url in p_httpfetch
        opts: {start, end, verbose} see p_GET for documentation
        throws: TransportError if fails
         */
        //if (!(url && url.includes(':') ))
        //    throw new errors.CodingError("TransportHTTP.p_rawfetch bad url: "+url);
        if (url.href.includes('contenthash//'))
            console.error("XXX@91",url)
        if (((typeof url === "string") ? url : url.href).includes('/getall/table')) {
            throw new Error("Probably dont want to be calling p_rawfetch on a KeyValueTable, especially since dont know if its keyvaluetable or subclass"); //TODO-NAMING
            return { // I'm not sure what this return would have done  - looks half finished to me?
                table: "keyvaluetable",
                }
        } else {
            return await httptools.p_GET(this._url(url, servercommands.rawfetch), opts);
        }
    }

    p_rawlist(url, {verbose=false}={}) {
        // obj being loaded
        // Locate and return a block, based on its url
        if (!url) throw new errors.CodingError("TransportHTTP.p_rawlist: requires url");
        return httptools.p_GET(this._url(url, servercommands.rawlist), {verbose});
    }
    rawreverse() { throw new errors.ToBeImplementedError("Undefined function TransportHTTP.rawreverse"); }

    async p_rawstore(data, {verbose=false}={}) {
        /*
        Store data on http server,
        data:   string
        resolves to: {string}: url
        throws: TransportError on failure in p_POST > p_httpfetch
         */
        //PY: res = self._sendGetPost(True, "rawstore", headers={"Content-Type": "application/octet-stream"}, urlargs=[], data=data, verbose=verbose)
        console.assert(data, "TransportHttp.p_rawstore: requires data");
        let res = await httptools.p_POST(this._cmdurl(servercommands.rawstore), "application/octet-stream", data, verbose); // resolves to URL
        let parsedurl = Url.parse(res);
        let pathparts = parsedurl.pathname.split('/');
        return `contenthash:/contenthash/${pathparts.slice(-1)}`

    }

    p_rawadd(url, sig, {verbose=false}={}) {
        //verbose=true;
        if (!url || !sig) throw new errors.CodingError("TransportHTTP.p_rawadd: invalid parms",url, sig);
        if (verbose) console.log("rawadd", url, sig);
        let value = JSON.stringify(sig.preflight(Object.assign({},sig)))+"\n";
        return httptools.p_POST(this._url(url, servercommands.rawadd), "application/json", value, verbose); // Returns immediately
    }

    p_newlisturls(cl, {verbose=false}={}) {
       let  u = cl._publicurls.map(urlstr => Url.parse(urlstr))
            .find(parsedurl =>
                ((parsedurl.protocol === "https:" && ["gateway.dweb.me", "dweb.me"].includes(parsedurl.host)
                    && (parsedurl.pathname.includes('/content/rawfetch') || parsedurl.pathname.includes('/contenthash/')))
                || (parsedurl.protocol === "contenthash:") && (parsedurl.pathname.split('/')[1] === "contenthash")));
        if (!u) {
            u = `contenthash:/contenthash/${ cl.keypair.verifyexportmultihashsha256_58() }`; // Pretty random, but means same test will generate same list and server is expecting base58 of a hash
        }
        return [u,u];
    }

    // ============================== Key Value support


    // Support for Key-Value pairs as per
    // https://docs.google.com/document/d/1yfmLRqKPxKwB939wIy9sSaa7GKOzM5PrCZ4W1jRGW6M/edit#
    async p_newdatabase(pubkey, {verbose=false}={}) {
        //if (pubkey instanceof Dweb.PublicPrivate)
        if (pubkey.hasOwnProperty("keypair"))
            pubkey = pubkey.keypair.signingexport()
        // By this point pubkey should be an export of a public key of form xyz:abc where xyz
        // specifies the type of public key (NACL VERIFY being the only kind we expect currently)
        let u =  `${this.urlbase}/getall/table/${encodeURIComponent(pubkey)}`;
        return {"publicurl": u, "privateurl": u};
    }


    async p_newtable(pubkey, table, {verbose=false}={}) {
        if (!pubkey) throw new errors.CodingError("p_newtable currently requires a pubkey");
        let database = await this.p_newdatabase(pubkey, {verbose});
        // If have use cases without a database, then call p_newdatabase first
        return { privateurl: `${database.privateurl}/${table}`,  publicurl: `${database.publicurl}/${table}`}  // No action required to create it
    }

    //TODO-KEYVALUE needs signing with private key of list
    async p_set(url, keyvalues, value, {verbose=false}={}) {  // url = yjs:/yjs/database/table/key
        if (!url || !keyvalues) throw new errors.CodingError("TransportHTTP.p_set: invalid parms",url, keyvalyes);
        if (verbose) console.log("p_set", url, keyvalues, value);
        if (typeof keyvalues === "string") {
            let kv = JSON.stringify([{key: keyvalues, value: value}]);
            await httptools.p_POST(this._url(url, servercommands.set), "application/json", kv, verbose); // Returns immediately
        } else {
            let kv = JSON.stringify(Object.keys(keyvalues).map((k) => ({"key": k, "value": keyvalues[k]})));
            await httptools.p_POST(this._url(url, servercommands.set), "application/json", kv, verbose); // Returns immediately
        }
    }

    _keyparm(key) {
        return `key=${encodeURIComponent(key)}`
    }
    async p_get(url, keys, {verbose=false}={}) {
        if (!url && keys) throw new errors.CodingError("TransportHTTP.p_get: requires url and at least one key");
        let parmstr =Array.isArray(keys)  ?  keys.map(k => this._keyparm(k)).join('&') : this._keyparm(keys)
        let res = await httptools.p_GET(this._url(url, servercommands.get, parmstr), {verbose});
        return Array.isArray(keys) ? res : res[keys]
    }

    async p_delete(url, keys, {verbose=false}={}) {
        if (!url && keys) throw new errors.CodingError("TransportHTTP.p_get: requires url and at least one key");
        let parmstr =  keys.map(k => this._keyparm(k)).join('&');
        await httptools.p_GET(this._url(url, servercommands.delete, parmstr), {verbose});
    }

    async p_keys(url, {verbose=false}={}) {
        if (!url && keys) throw new errors.CodingError("TransportHTTP.p_get: requires url and at least one key");
        return await httptools.p_GET(this._url(url, servercommands.keys), {verbose});
    }
    async p_getall(url, {verbose=false}={}) {
        if (!url && keys) throw new errors.CodingError("TransportHTTP.p_get: requires url and at least one key");
        return await httptools.p_GET(this._url(url, servercommands.getall), {verbose});
    }
    /* Make sure doesnt shadow regular p_rawfetch
    async p_rawfetch(url, verbose) {
        return {
            table: "keyvaluetable",
            _map: await this.p_getall(url, {verbose})
        };   // Data struc is ok as SmartDict.p_fetch will pass to KVT constructor
    }
    */

    p_info(verbose) { return httptools.p_GET(`${this.urlbase}/info`, {verbose}); }

    static async p_test(opts={}, verbose=false) {
        if (verbose) {console.log("TransportHTTP.test")}
        try {
            let transport = await this.p_setup(opts, verbose);
            if (verbose) console.log("HTTP connected");
            let res = await transport.p_info(verbose);
            if (verbose) console.log("TransportHTTP info=",res);
            res = await transport.p_status(verbose);
            console.assert(res === Transport.STATUS_CONNECTED);
            await transport.p_test_kvt("NACL%20VERIFY", verbose);
        } catch(err) {
            console.log("Exception thrown in TransportHTTP.test:", err.message);
            throw err;
        }
    }

    static async test() {
        return this;
    }

}
Transports._transportclasses["HTTP"] = TransportHTTP;
exports = module.exports = TransportHTTP;

