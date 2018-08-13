const Transport = require('./Transport'); // Base class for TransportXyz
const Transports = require('./Transports'); // Manage all Transports that are loaded
const httptools = require('./httptools'); // Expose some of the httptools so that IPFS can use it as a backup
const Url = require('url');
const stream = require('readable-stream');
const debughttp = require('debug')('dweb-transports:http');


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

    constructor(options) {
        super(options);
        this.options = options;
        this.urlbase = options.http.urlbase;
        this.supportURLs = ['contenthash', 'http','https'];
        this.supportFunctions = ['fetch', 'store', 'add', 'list', 'reverse', 'newlisturls', "get", "set", "keys", "getall", "delete", "newtable", "newdatabase"]; //Does not support: listmonitor - reverse is disabled somewhere not sure if here or caller
        this.supportFeatures = ['fetch.range']
        this.name = "HTTP";             // For console log etc
        this.status = Transport.STATUS_LOADED;
    }

    static setup0(options) {
        let combinedoptions = Transport.mergeoptions({ http: defaulthttpoptions },options);
        try {
            let t = new TransportHTTP(combinedoptions);
            Transports.addtransport(t);
            return t;
        } catch (err) {
            console.error("HTTP unable to setup0", err.message);
            throw err;
        }
    }
    async p_setup1(cb) {
        this.status = Transport.STATUS_STARTING;
        if (cb) cb(this);
        await this.p_status();
        if (cb) cb(this);
        return this;
    }

    async p_status() {
        /*
        Return a numeric code for the status of a transport.
         */
        try {
            this.info = await this.p_info();
            this.status = Transport.STATUS_CONNECTED;
        } catch(err) {
            console.error(this.name, ": Error in p_status.info",err.message);
            this.status = Transport.STATUS_FAILED;
        }
        return super.p_status();
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
        opts: {start, end} see p_GET for documentation
        throws: TransportError if fails
         */
        //if (!(url && url.includes(':') ))
        //    throw new errors.CodingError("TransportHTTP.p_rawfetch bad url: "+url);
        //if (url.href.includes('contenthash//'))
        //    console.error("XXX@91", url)
        if (((typeof url === "string") ? url : url.href).includes('/getall/table')) {
            throw new Error("Probably dont want to be calling p_rawfetch on a KeyValueTable, especially since dont know if its keyvaluetable or subclass"); //TODO-NAMING
            return { // I'm not sure what this return would have done  - looks half finished to me?
                table: "keyvaluetable",
                }
        } else {
            return await httptools.p_GET(this._url(url, servercommands.rawfetch), opts);
        }
    }

    p_rawlist(url) {
        // obj being loaded
        // Locate and return a block, based on its url
        if (!url) throw new errors.CodingError("TransportHTTP.p_rawlist: requires url");
        return httptools.p_GET(this._url(url, servercommands.rawlist));
    }
    rawreverse() { throw new errors.ToBeImplementedError("Undefined function TransportHTTP.rawreverse"); }

    async p_rawstore(data) {
        /*
        Store data on http server,
        data:   string
        resolves to: {string}: url
        throws: TransportError on failure in p_POST > p_httpfetch
         */
        //PY: res = self._sendGetPost(True, "rawstore", headers={"Content-Type": "application/octet-stream"}, urlargs=[], data=data)
        console.assert(data, "TransportHttp.p_rawstore: requires data");
        let res = await httptools.p_POST(this._cmdurl(servercommands.rawstore), "application/octet-stream", data); // resolves to URL
        let parsedurl = Url.parse(res);
        let pathparts = parsedurl.pathname.split('/');
        return `contenthash:/contenthash/${pathparts.slice(-1)}`

    }

    p_rawadd(url, sig) {
        // Logged by Transports
        if (!url || !sig) throw new errors.CodingError("TransportHTTP.p_rawadd: invalid parms", url, sig);
        let value = JSON.stringify(sig.preflight(Object.assign({},sig)))+"\n";
        return httptools.p_POST(this._url(url, servercommands.rawadd), "application/json", value); // Returns immediately
    }

    p_newlisturls(cl) {
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

    // ============================== Stream support

    /*
      Code disabled until have a chance to test it with <VIDEO> tag etc, problem is that it returns p_createReadStream whch is async
      if need sync, look at WebTorrent and how it buffers through a stream which can be returned immediately
     */
    async p_f_createReadStream(url, {wanturl=false}={}) {
        /*
        Fetch bytes progressively, using a node.js readable stream, based on a url of the form:
        No assumption is made about the data in terms of size or structure.

        This is the initialisation step, which returns a function suitable for <VIDEO>

        Returns a new Promise that resolves to function for a node.js readable stream.

        Node.js readable stream docs: https://nodejs.org/api/stream.html#stream_readable_streams

        :param string url: URL of object being retrieved of form  magnet:xyzabc/path/to/file  (Where xyzabc is the typical magnet uri contents)
        :resolves to: f({start, end}) => stream (The readable stream.)
        :throws:        TransportError if url invalid - note this happens immediately, not as a catch in the promise
         */
        //Logged by Transports
        //debughttp("p_f_createreadstream %s", Url.parse(url).href);
        try {
            let self = this;
            if (wanturl) {
                return url;
            } else {
                return function (opts) { return self.p_createReadStream(url, opts); };
            }
        } catch(err) {
            //Logged by Transports
            //console.warn(`p_f_createReadStream failed on ${Url.parse(url).href} ${err.message}`);
            throw(err);
        }
    }

    async createReadStream(url, opts) {
        /*
        The function, encapsulated and inside another function by p_f_createReadStream (see docs)
        NOTE THIS DOESNT WONT WORK FOR <VIDEO> tags, but shouldnt be using it there anyway - reports stream.on an filestream.pipe aren't functions

        :param file:    Webtorrent "file" as returned by webtorrentfindfile
        :param opts: { start: byte to start from; end: optional end byte }
        :resolves to stream: The readable stream.
         */

        debughttp("createreadstream %s %o", Url.parse(url).href, opts);
        let through;
        try {
            through = new stream.PassThrough();
            const p_filestream = httptools.p_GET(this._url(url, servercommands.rawfetch), Object.assign({wantstream: true}, opts));
            p_filestream.then(s => s.pipe(through));
            return through; // Returns through synchronously, before the pipe is setup
        } catch(err) {
            console.warn(this.name,"createReadStream caught error", err.message);
            if (typeof through.destroy === 'function')
                through.destroy(err);
            else through.emit('error', err)
        }



    }

    async p_createReadStream(url, opts) {
        /*
        The function, encapsulated and inside another function by p_f_createReadStream (see docs)
        NOTE THIS PROBABLY WONT WORK FOR <VIDEO> tags, but shouldnt be using it there anyway

        :param file:    Webtorrent "file" as returned by webtorrentfindfile
        :param opts: { start: byte to start from; end: optional end byte }
        :resolves to stream: The readable stream.
         */
        debughttp("createreadstream %s %o", Url.parse(url).href, opts);
        try {
            return await httptools.p_GET(this._url(url, servercommands.rawfetch), Object.assign({wantstream: true}, opts));
        } catch(err) {
            console.warn(this.name, "caught error", err);
            throw err;
        }
    }


    // ============================== Key Value support


    // Support for Key-Value pairs as per
    // https://docs.google.com/document/d/1yfmLRqKPxKwB939wIy9sSaa7GKOzM5PrCZ4W1jRGW6M/edit#
    async p_newdatabase(pubkey) {
        //if (pubkey instanceof Dweb.PublicPrivate)
        if (pubkey.hasOwnProperty("keypair"))
            pubkey = pubkey.keypair.signingexport()
        // By this point pubkey should be an export of a public key of form xyz:abc where xyz
        // specifies the type of public key (NACL VERIFY being the only kind we expect currently)
        let u =  `${this.urlbase}/getall/table/${encodeURIComponent(pubkey)}`;
        return {"publicurl": u, "privateurl": u};
    }


    async p_newtable(pubkey, table) {
        if (!pubkey) throw new errors.CodingError("p_newtable currently requires a pubkey");
        let database = await this.p_newdatabase(pubkey);
        // If have use cases without a database, then call p_newdatabase first
        return { privateurl: `${database.privateurl}/${table}`,  publicurl: `${database.publicurl}/${table}`}  // No action required to create it
    }

    //TODO-KEYVALUE needs signing with private key of list
    async p_set(url, keyvalues, value) {  // url = yjs:/yjs/database/table/key
        if (!url || !keyvalues) throw new errors.CodingError("TransportHTTP.p_set: invalid parms", url, keyvalyes);
        // Logged by Transports
        //debughttp("p_set %o %o %o", url, keyvalues, value);
        if (typeof keyvalues === "string") {
            let kv = JSON.stringify([{key: keyvalues, value: value}]);
            await httptools.p_POST(this._url(url, servercommands.set), "application/json", kv); // Returns immediately
        } else {
            let kv = JSON.stringify(Object.keys(keyvalues).map((k) => ({"key": k, "value": keyvalues[k]})));
            await httptools.p_POST(this._url(url, servercommands.set), "application/json", kv); // Returns immediately
        }
    }

    _keyparm(key) {
        return `key=${encodeURIComponent(key)}`
    }
    async p_get(url, keys) {
        if (!url && keys) throw new errors.CodingError("TransportHTTP.p_get: requires url and at least one key");
        let parmstr =Array.isArray(keys)  ?  keys.map(k => this._keyparm(k)).join('&') : this._keyparm(keys)
        let res = await httptools.p_GET(this._url(url, servercommands.get, parmstr));
        return Array.isArray(keys) ? res : res[keys]
    }

    async p_delete(url, keys) {
        if (!url && keys) throw new errors.CodingError("TransportHTTP.p_get: requires url and at least one key");
        let parmstr =  keys.map(k => this._keyparm(k)).join('&');
        await httptools.p_GET(this._url(url, servercommands.delete, parmstr));
    }

    async p_keys(url) {
        if (!url && keys) throw new errors.CodingError("TransportHTTP.p_get: requires url and at least one key");
        return await httptools.p_GET(this._url(url, servercommands.keys));
    }
    async p_getall(url) {
        if (!url && keys) throw new errors.CodingError("TransportHTTP.p_get: requires url and at least one key");
        return await httptools.p_GET(this._url(url, servercommands.getall));
    }
    /* Make sure doesnt shadow regular p_rawfetch
    async p_rawfetch(url) {
        return {
            table: "keyvaluetable",
            _map: await this.p_getall(url)
        };   // Data struc is ok as SmartDict.p_fetch will pass to KVT constructor
    }
    */

    p_info() { return httptools.p_GET(`${this.urlbase}/info`); }

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

    static async test() {
        return this;
    }

}
Transports._transportclasses["HTTP"] = TransportHTTP;
exports = module.exports = TransportHTTP;

