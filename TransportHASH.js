const Transport = require('./Transport'); // Base class for TransportXyz
const Transports = require('./Transports'); // Manage all Transports that are loaded
const httptools = require('./httptools'); // Expose some of the httptools so that IPFS can use it as a backup
const { CodingError, ToBeImplementedError } = require('./Errors');
const Url = require('url');
const debug = require('debug')('dweb-transports:hash');
const canonicaljson = require('@stratumn/canonicaljson');

defaultHashOptions = {
  urlbase: 'https://dweb.me', // Note this was running dweb-gateway, but wont be much longer, this will need reimplementing if going to be used
  //heartbeat: { delay: 30000 } // Uncomment to check once a minute, but not needed since piggybacking on HTTP
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


class TransportHASH extends Transport {
  /* Subclass of Transport for handling Hashes - see API.md for docs TODO-HASH write up

    options {
        urlbase:    e.g. https://dweb.me    Where to go for URLS like /contenthash
        heartbeat: {
            delay       // Time in milliseconds between checks - 30000 might be appropriate - if missing it wont do a heartbeat
        }
    }
   */

  constructor(options) {
    super(options); // These are options.hash
    this.options = options;
    this.urlbase = options.urlbase; // e.g. https://dweb.me
    this.supportURLs = ['contenthash'];
    this.supportFunctions = ['fetch', 'store', 'add', 'list', 'reverse', 'newlisturls', "get", "set", "keys", "getall", "delete", "newtable", "newdatabase"]; //Does not support: listmonitor - reverse is disabled somewhere not sure if here or caller
    this.supportFeatures = ['noCache'];
    if (typeof window === "undefined") {
      // running in node, can support createReadStream,  (browser can't - see createReadStream below)
      this.supportFunctions.push("createReadStream");
    }
    // noinspection JSUnusedGlobalSymbols
    this.supportFeatures = ['fetch.range', 'noCache'];
    this.name = "HASH";             // For console log etc
    this.setStatus(Transport.STATUS_LOADED);
  }

  static setup0(options) {
    let combinedoptions = Transport.mergeoptions(defaultHashOptions, options.hash);
    try {
      let t = new TransportHASH(combinedoptions);
      Transports.addtransport(t);
      return t;
    } catch (err) {
      debug("ERROR: HASH unable to setup0", err.message);
      throw err;
    }
  }

  p_setup2() { // Has to run after TransportHTTP - note status passed back via eventListeners now
    this.http = Transports.http(); // Find an HTTP transport to use
    return new Promise((resolve, unusedReject) => {
      this.setStatus(Transport.STATUS_STARTING);
      this.updateStatus((unusedErr, unusedRes) => {
        this.startHeartbeat(this.options.heartbeat);
        resolve(this);  // Note always resolve even if error from p_status as have set status to failed
      });
    })
  }

  async p_status(cb) { //TODO-API
    /*
    Return (via cb or promise) a numeric code for the status of a transport.
     */
    if (cb) { try { this.updateStatus(cb) } catch(err) { cb(err)}} else { return new Promise((resolve, reject) => { try { this.updateStatus((err, res) => { if (err) {reject(err)} else {resolve(res)} })} catch(err) {reject(err)}})} // Promisify pattern v2f
  }
  updateStatus(cb) { //TODO-API
    this.updateInfo((err, res) => {
      if (err) {
        debug("Error status call to info failed %s", err.message);
        this.setStatus(Transport.STATUS_FAILED);
        cb(null, this.status); // DOnt pass error up,  the status indicates the error
      } else {
        this.info = res;    // Save result
        this.setStatus(Transport.STATUS_CONNECTED);
        cb(null, this.status);
      }
    });
  }

  startHeartbeat({delay=undefined}) {
    if (delay) {
      debug("%s Starting Heartbeat", this.name)
      this.heartbeatTimer = setInterval(() => {
        this.updateStatus( (unusedErr, unusedRes)=>{});
      }, delay);
    }
  }
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      debug("stopping heartbeat");
      clearInterval(this.heartbeatTimer);}
  }
  stop(cb) {
    this.stopHeartbeat();
    this.setStatus(Transport.STATUS_FAILED);
    cb(null, this);
  }

  _cmdurl(command) {
    return  `${this.urlbase}/${command}`
  }
  _url(url, command, parmstr) {
    if (!url) throw new CodingError(`${command}: requires url`);
    if (typeof url !== "string") { url = url.href }
    url = url.replace('contenthash:/contenthash', this._cmdurl(command)) ;
    url = url.replace('getall/table', command);
    url = url + (parmstr ? "?"+parmstr : "");
    return url;
  }

  // noinspection JSCheckFunctionSignatures
  async p_rawfetch(url, opts={}) {
    /*
    Fetch from underlying transport,
    Fetch is used both for contenthash requests and table as when passed to SmartDict.p_fetch may not know what we have
    url: Of resource - which is turned into the HTTP url in p_httpfetch
    opts: {start, end, retries, noCache} see p_GET for documentation
    throws: TransportError if fails
     */
    if (((typeof url === "string") ? url : url.href).includes('/getall/table')) {
      throw new Error("Probably dont want to be calling p_rawfetch on a KeyValueTable, especially since dont know if its keyvaluetable or subclass"); //TODO-NAMING
    } else {
      return await this.http.p_rawfetch(this._url(url, servercommands.rawfetch), opts);
    }
  }

  p_rawlist(url) {
    // obj being loaded
    // Locate and return a block, based on its url
    if (!url) throw new CodingError("TransportHASH.p_rawlist: requires url");
    return this.http.p_rawfetch(this._url(url, servercommands.rawlist));
  }
  rawreverse() { throw new ToBeImplementedError("Undefined function TransportHASH.rawreverse"); }

  async p_rawstore(data) {
    /*
    Store data on http server,
    data:   string
    resolves to: {string}: url
    throws: TransportError on failure in p_POST > p_httpfetch
     */
    //PY: res = self._sendGetPost(True, "rawstore", headers={"Content-Type": "application/octet-stream"}, urlargs=[], data=data)
    console.assert(data, "TransportHASH.p_rawstore: requires data");
    const res = await httptools.p_POST(this._cmdurl(servercommands.rawstore), {data, contenttype: "application/octet-stream"}); // resolves to URL
    let parsedurl = Url.parse(res);
    let pathparts = parsedurl.pathname.split('/');
    return `contenthash:/contenthash/${pathparts.slice(-1)}`
  }

  p_rawadd(url, sig) {
    // Logged by Transports
    if (!url || !sig) throw new CodingError("TransportHASH.p_rawadd: invalid parms", url, sig);
    const data = canonicaljson.stringify(sig.preflight(Object.assign({},sig)))+"\n";
    return httptools.p_POST(this._url(url, servercommands.rawadd), {data, contenttype: "application/json"}); // Returns immediately
  }

  p_newlisturls(cl) {
    let  u = cl._publicurls.map(urlstr => Url.parse(urlstr))
      .find(parsedurl =>
        ((parsedurl.protocol === "https:" && ["gateway.dweb.me", "dweb.me"].includes(parsedurl.host)
          && (parsedurl.pathname.includes('/content/rawfetch') || parsedurl.pathname.includes('/contenthash/')))
          || (parsedurl.protocol === "contenthash:") && (parsedurl.pathname.split('/')[1] === "contenthash")));
    if (!u) {
      // noinspection JSUnresolvedVariable
      u = `contenthash:/contenthash/${ cl.keypair.verifyexportmultihashsha256_58() }`; // Pretty random, but means same test will generate same list and server is expecting base58 of a hash
    }
    return [u,u];
  }

  // ============================== Stream support via Transport HTTP = see documentation there =====

  async p_f_createReadStream(url, {wanturl=false}={}) {
    return this.http.p_f_createReadStream(this._url(url, servercommands.rawfetch), {wanturl});
  }

  createReadStream(url, opts) {
    return this.http.createReadStream(this._url(url, servercommands.rawfetch), opts);
  }

  async p_createReadStream(url, opts) {
    return this.http.p_createReadStream(this._url(url, servercommands.rawfetch), opts);
  }

  // ============================== Key Value support


  // Support for Key-Value pairs as per
  // https://docs.google.com/document/d/1yfmLRqKPxKwB939wIy9sSaa7GKOzM5PrCZ4W1jRGW6M/edit#
  async p_newdatabase(pubkey) {
    //if (pubkey instanceof Dweb.PublicPrivate)
    if (pubkey.hasOwnProperty("keypair"))
      pubkey = pubkey.keypair.signingexport();
    // By this point pubkey should be an export of a public key of form xyz:abc where xyz
    // specifies the type of public key (NACL VERIFY being the only kind we expect currently)
    let u =  `${this.urlbase}/getall/table/${encodeURIComponent(pubkey)}`;
    return {"publicurl": u, "privateurl": u};
  }


  async p_newtable(pubkey, table) {
    if (!pubkey) throw new CodingError("p_newtable currently requires a pubkey");
    let database = await this.p_newdatabase(pubkey);
    // If have use cases without a database, then call p_newdatabase first
    return { privateurl: `${database.privateurl}/${table}`,  publicurl: `${database.publicurl}/${table}`}  // No action required to create it
  }

  //TODO-KEYVALUE needs signing with private key of list
  async p_set(url, keyvalues, value) {  // url = yjs:/yjs/database/table/key
    if (!url || !keyvalues) throw new CodingError("TransportHASH.p_set: invalid parms", url, keyvalyes);
    // Logged by Transports
    //debug("p_set %o %o %o", url, keyvalues, value);
    if (typeof keyvalues === "string") {
      let data = canonicaljson.stringify([{key: keyvalues, value: value}]);
      await httptools.p_POST(this._url(url, servercommands.set), {data, contenttype: "application/json"}); // Returns immediately
    } else {
      let data = canonicaljson.stringify(Object.keys(keyvalues).map((k) => ({"key": k, "value": keyvalues[k]})));
      await httptools.p_POST(this._url(url, servercommands.set), {data, contenttype: "application/json"}); // Returns immediately
    }
  }

  _keyparm(key) {
    return `key=${encodeURIComponent(key)}`
  }
  async p_get(url, keys) {
    if (!url && keys) throw new CodingError("TransportHASH.p_get: requires url and at least one key");
    let parmstr =Array.isArray(keys)  ?  keys.map(k => this._keyparm(k)).join('&') : this._keyparm(keys);
    const res = await httptools.p_GET(this._url(url, servercommands.get, parmstr));
    return Array.isArray(keys) ? res : res[keys]
  }

  async p_delete(url, keys) {
    if (!url && keys) throw new CodingError("TransportHASH.p_get: requires url and at least one key");
    let parmstr =  keys.map(k => this._keyparm(k)).join('&');
    await httptools.p_GET(this._url(url, servercommands.delete, parmstr));
  }

  async p_keys(url) {
    if (!url && keys) throw new CodingError("TransportHASH.p_get: requires url and at least one key");
    return await httptools.p_GET(this._url(url, servercommands.keys));
  }
  async p_getall(url) {
    if (!url && keys) throw new CodingError("TransportHASH.p_get: requires url and at least one key");
    return await httptools.p_GET(this._url(url, servercommands.getall));
  }
  /* Make sure doesnt shadow regular p_rawfetch
  async p_rawfetch(url) {
      return {
          table: "keyvaluetable",
          _map: await this.p_getall(url)
      };   // Data structure is ok as SmartDict.p_fetch will pass to KVT constructor
  }
  */

  async p_info() { // TODO-API
    /*
    Return (via cb or promise) a numeric code for the status of transport.
     */
    return new Promise((resolve, reject) => { try { this.updateInfo((err, res) => { if (err) {reject(err)} else {resolve(res)} })} catch(err) {reject(err)}}) // Promisify pattern v2b (no CB)
  }

  updateInfo(cb) {
    httptools.p_GET(`${this.urlbase}/info`, {retries: 1}, cb);   // Try info, but do not retry (usually heartbeat will reconnect)
  }

  static async p_test(opts= {}) {
    { console.log('TransportHASH.test') }
    try {
      const transport = await this.p_setup(opts);
      console.log("HASH connected");
      let res = await transport.p_info();
      console.log("TransportHASH info=",res);
      res = await transport.p_status();
      console.assert(res === Transport.STATUS_CONNECTED);
      await transport.p_test_kvt("NACL%20VERIFY");
    } catch(err) {
      console.log("Exception thrown in TransportHASH.test:", err.message);
      throw err;
    }
  }

  static async test() {
    return this;
  }

}
Transports._transportclasses["HASH"] = TransportHASH;
TransportHASH.requires = TransportHASH.scripts = []; // Nothing to load
exports = module.exports = TransportHASH;

