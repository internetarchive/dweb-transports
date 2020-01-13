const Transport = require('./Transport'); // Base class for TransportXyz
const Transports = require('./Transports'); // Manage all Transports that are loaded
const httptools = require('./httptools'); // Expose some of the httptools so that IPFS can use it as a backup
const Url = require('url');
const stream = require('readable-stream');
const debug = require('debug')('dweb-transports:http');
//TODO-SPLIT pull /arc out of here, then dont need by default to hearbeat to dweb.me

defaulthttpoptions = {
    urlbase: 'https://dweb.me',
    heartbeat: { delay: 30000 } // By default check twice a minute
};

function ObjectDeepEquals(o1, o2) {
  if (Array.isArray(o1)) {
    return (Array.isArray(o2) && (o1.length === o2.length) && o1.every((v, i) => ObjectDeepEquals(v, o2[i])))
  } else if (typeof o1 === "object") {
    if (typeof o2 !== "object") {
      return false;
    } else {
      const k1 = Object.keys(o1);
      const k2 = Object.keys(o2);
      return ((k1.length === k2.length) && k1.every((k,i) => k2[i] === k && ObjectDeepEquals(o1[k], o2[k])));
    }
  } else {
    return (o1 === o2);
  }
}
class TransportHTTP extends Transport {
  /* Subclass of Transport for handling HTTP - see API.md for docs

    options {
        urlbase:    e.g. https://dweb.me    Where to go for URLS like /info or table & list urls
        heartbeat: {
            delay       // Time in milliseconds between checks - 30000 might be appropriate - if missing it wont do a heartbeat
        }
    }
   */

    constructor(options) {
        super(options); // These are now options.http
        this.options = options;
        this.urlbase = options.urlbase; // e.g. https://dweb.me
        this.supportURLs = ['http','https'];
        this.supportFunctions = ['fetch'];
        this.supportFeatures = ['noCache'];
        if (typeof window === "undefined") {
            // running in node, can support createReadStream,  (browser can't - see createReadStream below)
            this.supportFunctions.push("createReadStream");
        }
        // noinspection JSUnusedGlobalSymbols
        this.supportFeatures = ['fetch.range', 'noCache'];
        this.name = "HTTP";             // For console log etc
        this.setStatus(Transport.STATUS_LOADED);
    }

    static setup0(options) {
        let combinedoptions = Transport.mergeoptions(defaulthttpoptions, options.http);
        try {
            let t = new TransportHTTP(combinedoptions);
            Transports.addtransport(t);
            return t;
        } catch (err) {
            debug("ERROR: HTTP unable to setup0", err.message);
            throw err;
        }
    }

    p_setup1() {
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
    this.updateInfo({silentFinalError: true}, (err, res) => {
      if (err) {
        debug("Error status call to info failed %s", err.message);
        this.setStatus(Transport.STATUS_FAILED);
        cb(null, this.status); // DOnt pass error up,  the status indicates the error
      } else {
        const infoChanged = !ObjectDeepEquals(this.info, res);
        this.info = res;    // Save result
        this.setStatus(Transport.STATUS_CONNECTED, {forceSendEvent: infoChanged});
        cb(null, this.status);
      }
    });
  }

    startHeartbeat({delay=undefined}) {
        if (delay) {
            debug("%s Starting Heartbeat", this.name)
            this.heartbeatTimer = setInterval(() => {
                this.updateStatus((unusedErr, unusedRes)=>{});
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

    validFor(url, func, opts) {
        // Overrides Transport.prototype.validFor because HTTP's connection test is only really for dweb.me or dweb.archive.org or localhost
        // in particular this allows urls like https://be-api.us.archive.org
        return (this.connected() || url.protocol.startsWith("http")) && this.supports(url, func, opts);
    }
    async p_rawfetch(url, opts={}) {
        /*
        Fetch from underlying transport,
        Fetch is used both for contenthash requests and table as when passed to SmartDict.p_fetch may not know what we have
        url: Of resource - which is turned into the HTTP url in p_httpfetch
        opts: {start, end, retries, noCache, silentFinalError} see p_GET for documentation
        throws: TransportError if fails
         */
        return await httptools.p_GET(url, opts);
    }

  // ============================== Stream support
  //createReadStreamID: Transport superclass is good
  // createReadStreamFunction: Transport superclass is good
  // p_f_createReadStreamFunction: Transport superclass is good
  // createReadStream: Transport superclass is good

  // id is a url (obj or string)
  createReadStreamFetch(id, opts, cb) {
    httptools.p_GET(id, Object.assign({wantstream: true}, opts), cb);
  }

  // createReadStream breaks in browsers ... as 's' doesn't have .pipe but has .pipeTo and .pipeThrough neither of which work with stream.PassThrough
  // TODO See https://github.com/nodejs/readable-stream/issues/406 in case its fixed in which case enable createReadStream in constructor above.

    async p_info() { //TODO-API
        /*
        Return (via cb or promise) a numeric code for the status of a transport.
         */
        return new Promise((resolve, reject) => { try { this.updateInfo({}, (err, res) => { if (err) {reject(err)} else {resolve(res)} })} catch(err) {reject(err)}}) // Promisify pattern v2b (no CB)
    }

    updateInfo(opts = {}, cb) {
        if (typeof opts === "function") { cb = opts; opts={}; }
        httptools.p_GET(`${this.urlbase}/info`, Object.assign({retries: 1, silentFinalError: false}, opts), cb);   // Try info, but dont retry (usually heartbeat will reconnect)
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

    static async test() {
        return this;
    }

}
Transports._transportclasses["HTTP"] = TransportHTTP;
TransportHTTP.requires = TransportHTTP.scripts = []; // Nothing to load
exports = module.exports = TransportHTTP;

